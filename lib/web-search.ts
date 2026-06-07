/**
 * Recherche web générique pour Talk2Me.
 *
 * Doctrine talktome-no-excuses : si tout échoue → {results:[], source:'none'}
 * (l'IA se taira plutôt que dire "je n'ai pas pu chercher").
 * Doctrine talktome-embeds-only : aucune invention, on retourne UNIQUEMENT
 * ce que Brave Search / Bing / DuckDuckGo nous renvoient.
 * Doctrine retranscrire-api : titres, snippets, URLs jamais reformulés côté serveur.
 *
 * Path A — Brave Search API (si BRAVE_SEARCH_API_KEY défini). API propre,
 *          2000 req/mois gratuit, données structurées.
 * Path B — Bing HTML scrape (fallback, sans clé). Marche sur le serveur Genius
 *          alors que DDG anomaly-block notre IP. Parsing CSS `li.b_algo`.
 * Path C — DuckDuckGo HTML scrape (3e fallback). Souvent bloqué par
 *          anomaly detection mais utile depuis IPs non flaggées.
 * Path D — Silence : {results:[], source:'none'} (doctrine no-excuses).
 *
 * Cache mémoire 10 min sur la clé `query|limit`.
 */

import * as cheerio from 'cheerio';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string; // hostname pour affichage
  favicon?: string;
  thumbnail?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  source: 'brave' | 'bing' | 'ddg' | 'none';
}

interface CacheEntry {
  data: WebSearchResponse;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min
const FETCH_TIMEOUT = 8000;

// User-Agent navigateur classique (Firefox Linux récent) pour limiter
// les blocages anti-bot côté DuckDuckGo HTML.
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function faviconOf(url: string): string | undefined {
  const host = hostnameOf(url);
  if (!host) return undefined;
  // Google s2 favicon, taille 32 (assez bon pour 16x16 logo affiché)
  return `https://www.google.com/s2/favicons?sz=32&domain=${host}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// ====================== PATH A : BRAVE SEARCH ======================

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  profile?: { name?: string; img?: string };
  meta_url?: { hostname?: string; favicon?: string };
  thumbnail?: { src?: string };
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

async function searchBrave(
  query: string,
  limit: number,
  apiKey: string,
): Promise<WebSearchResult[] | null> {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(limit, 1), 10)),
    country: 'FR',
    search_lang: 'fr',
    safesearch: 'moderate',
  });
  const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      },
      FETCH_TIMEOUT,
    );
  } catch (e) {
    console.error('[web-search/brave] fetch error', e);
    return null;
  }
  if (!res.ok) {
    console.warn('[web-search/brave] HTTP', res.status);
    return null;
  }
  let data: BraveSearchResponse;
  try {
    data = (await res.json()) as BraveSearchResponse;
  } catch {
    return null;
  }
  const raw = Array.isArray(data?.web?.results) ? data.web!.results! : [];
  const out: WebSearchResult[] = [];
  for (const r of raw) {
    if (!r || typeof r.title !== 'string' || typeof r.url !== 'string') continue;
    const title = r.title.trim();
    const u = r.url.trim();
    if (!title || !/^https?:\/\//i.test(u)) continue;
    const snippet =
      typeof r.description === 'string' ? r.description.trim() : '';
    const host =
      (r.meta_url && typeof r.meta_url.hostname === 'string'
        ? r.meta_url.hostname
        : undefined) || hostnameOf(u);
    const favicon =
      (r.meta_url && typeof r.meta_url.favicon === 'string'
        ? r.meta_url.favicon
        : undefined) || faviconOf(u);
    const thumb =
      r.thumbnail && typeof r.thumbnail.src === 'string'
        ? r.thumbnail.src
        : undefined;
    out.push({
      title,
      url: u,
      snippet,
      source: host,
      favicon,
      thumbnail: thumb,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ====================== PATH B : BING HTML =========================

/**
 * Scrape bing.com/search. Marche sans clé, sans cookie, depuis IP serveur.
 *
 * Structure HTML : `<li class="b_algo">` contient :
 *   - <h2><a href="https://www.bing.com/ck/a?...u=a1<base64url>&..."/></h2>
 *     → on décode `u=a1<base64url>` pour retrouver l'URL réelle. Fallback :
 *       `<cite>` qui contient l'URL en clair (mais souvent tronquée avec "›").
 *   - <p class="b_lineclamp..."> ou <div class="b_caption"><p> : snippet
 *
 * Si l'URL extraite est encore un bing.com/ck/a (échec décodage), on tente
 * d'extraire depuis le cite.
 */
function decodeBingRedirect(href: string): string {
  if (!href) return href;
  if (!href.includes('bing.com/ck/a')) return href;
  const m = href.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
  if (!m) return href;
  try {
    // Buffer.from supporte base64url depuis Node 16+
    return Buffer.from(m[1], 'base64url').toString('utf8');
  } catch {
    return href;
  }
}

async function searchBing(
  query: string,
  limit: number,
): Promise<WebSearchResult[] | null> {
  const params = new URLSearchParams({
    q: query,
    setlang: 'fr',
    cc: 'fr',
  });
  const url = `https://www.bing.com/search?${params.toString()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr,fr-FR;q=0.9,en;q=0.6',
        },
        redirect: 'follow',
      },
      FETCH_TIMEOUT,
    );
  } catch (e) {
    console.error('[web-search/bing] fetch error', e);
    return null;
  }
  if (!res.ok) {
    console.warn('[web-search/bing] HTTP', res.status);
    return null;
  }
  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }
  const $ = cheerio.load(html);
  const out: WebSearchResult[] = [];
  $('li.b_algo').each((_, el) => {
    if (out.length >= limit) return false;
    const $el = $(el);
    const a = $el.find('h2 a').first();
    const titleRaw = a.text().trim();
    let href = a.attr('href') || '';
    if (!titleRaw || !href) return;
    href = decodeBingRedirect(href);
    if (!/^https?:\/\//i.test(href)) {
      // tentative fallback via cite
      const cite = $el.find('cite').first().text().trim();
      if (/^https?:\/\//i.test(cite)) href = cite.split(/\s+/)[0];
      else return;
    }
    // snippet : plusieurs slots possibles selon le layout
    let snippet = $el.find('div.b_caption p').first().text().trim();
    if (!snippet) {
      snippet = $el
        .find('p.b_lineclamp1, p.b_lineclamp2, p.b_lineclamp3, p.b_lineclamp4')
        .first()
        .text()
        .trim();
    }
    if (!snippet) {
      snippet = $el.find('div.b_caption').first().text().trim().slice(0, 300);
    }
    const host = hostnameOf(href);
    out.push({
      title: titleRaw,
      url: href,
      snippet,
      source: host,
      favicon: faviconOf(href),
    });
  });
  return out;
}

// ====================== PATH C : DUCKDUCKGO HTML ===================

/**
 * Scrape DuckDuckGo HTML (html.duckduckgo.com). Le HTML est servi sans JS,
 * ce qui rend le parsing stable tant que DDG ne change pas ses classes.
 * Résultats : <div class="result"> avec :
 *   - <a class="result__a" href="...">Title</a>
 *   - <a class="result__snippet">snippet text</a>
 *
 * Les href DDG sont souvent en redirect `/l/?uddg=<encoded_url>`. On dé-wrappe.
 */
function unwrapDdgRedirect(href: string): string {
  try {
    // href peut être relatif (//duckduckgo.com/l/?uddg=...) ou absolu
    const u = href.startsWith('http')
      ? new URL(href)
      : new URL(href, 'https://duckduckgo.com');
    if (u.pathname === '/l/' && u.searchParams.has('uddg')) {
      const real = u.searchParams.get('uddg');
      if (real) return decodeURIComponent(real);
    }
    return u.toString();
  } catch {
    return href;
  }
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
): Promise<WebSearchResult[] | null> {
  const params = new URLSearchParams({ q: query, kl: 'fr-fr' });
  const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr,fr-FR;q=0.9,en;q=0.6',
          // DDG HTML accepte GET ; on évite Referer pour ne pas être vu comme bot
        },
        redirect: 'follow',
      },
      FETCH_TIMEOUT,
    );
  } catch (e) {
    console.error('[web-search/ddg] fetch error', e);
    return null;
  }
  if (!res.ok) {
    console.warn('[web-search/ddg] HTTP', res.status);
    return null;
  }
  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }

  const $ = cheerio.load(html);
  const out: WebSearchResult[] = [];
  $('div.result').each((_, el) => {
    if (out.length >= limit) return false;
    const $el = $(el);
    // Skip ads (DDG les marque parfois)
    if ($el.hasClass('result--ad') || $el.hasClass('result--ad-light')) return;
    const a = $el.find('a.result__a').first();
    const titleRaw = a.text().trim();
    let href = a.attr('href') || '';
    if (!titleRaw || !href) return;
    href = unwrapDdgRedirect(href);
    if (!/^https?:\/\//i.test(href)) return;
    const snippet = $el.find('a.result__snippet').first().text().trim();
    const host = hostnameOf(href);
    out.push({
      title: titleRaw,
      url: href,
      snippet,
      source: host,
      favicon: faviconOf(href),
    });
  });
  return out;
}

// ====================== ENTRY POINT ================================

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<WebSearchResponse> {
  const q = (query || '').trim();
  if (!q) return { results: [], source: 'none' };
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  const key = `${q.toLowerCase()}|${safeLimit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  // Path A : Brave si clé
  if (braveKey) {
    const brave = await searchBrave(q, safeLimit, braveKey);
    if (brave && brave.length > 0) {
      const out: WebSearchResponse = { results: brave, source: 'brave' };
      cache.set(key, { data: out, fetchedAt: Date.now() });
      return out;
    }
    // Brave KO → on continue les fallbacks (no_excuses)
  }

  // Path B : Bing HTML scrape (sans clé, fiable depuis IP serveur)
  const bing = await searchBing(q, safeLimit);
  if (bing && bing.length > 0) {
    const out: WebSearchResponse = { results: bing, source: 'bing' };
    cache.set(key, { data: out, fetchedAt: Date.now() });
    return out;
  }

  // Path C : DDG HTML fallback (souvent anomaly-blocked mais on tente)
  const ddg = await searchDuckDuckGo(q, safeLimit);
  if (ddg && ddg.length > 0) {
    const out: WebSearchResponse = { results: ddg, source: 'ddg' };
    cache.set(key, { data: out, fetchedAt: Date.now() });
    return out;
  }

  // Path D : silence (doctrine no_excuses : on retourne [] sans message)
  const empty: WebSearchResponse = { results: [], source: 'none' };
  // On ne cache PAS l'échec : permet retry au prochain appel
  return empty;
}
