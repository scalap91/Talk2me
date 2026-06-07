/**
 * fetch_url_content — DERNIER RECOURS.
 *
 * Étape 1 (implémentée) : fetch HTML léger + cheerio pour title + innerText.
 *   Couvre la majorité des pages statiques (wiki, articles, blogs, docs).
 *   Pas de browser headless → 100x plus rapide, pas d'install lourde.
 *
 * Étape 2 (TODO si besoin) : si la page est JS-heavy (innerText < 200 chars
 *   utiles), fallback vers un service Playwright/Puppeteer externe (ex via
 *   /home/ubuntu/puppeteer-service à étendre avec une route /extract). Pas
 *   d'install Playwright local (~400 Mo de browsers) tant qu'un cas concret
 *   ne le justifie pas — doctrine Pascal "Playwright dernier recours".
 *
 * Doctrine no-excuses : si rien d'utilisable → retourne null. Pas d'erreur.
 * Cache mémoire 1h.
 */

import * as cheerio from 'cheerio';

export interface UrlContent {
  title: string;
  text_excerpt: string;
  source_url: string;
  fetched_via: 'http' | 'browser';
}

interface CacheEntry {
  data: UrlContent | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1h
const FETCH_TIMEOUT = 15000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; Talk2MeBot/0.1; +https://genius-web.fr/talktome)';
const MAX_EXCERPT = 2000;

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(id);
  }
}

/** Extraction texte propre depuis le body HTML. */
function extractText($: cheerio.CheerioAPI): string {
  // Nettoie les éléments parasites
  $(
    'script, style, noscript, iframe, svg, header nav, footer, aside, [aria-hidden="true"]',
  ).remove();
  // Préférence : main / article / .content
  const candidates = ['main', 'article', '[role="main"]', '.content', '#content'];
  let txt = '';
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length) {
      txt = el.text();
      if (txt.trim().length > 200) break;
    }
  }
  if (!txt || txt.trim().length < 200) {
    txt = $('body').text();
  }
  return txt
    .replace(/\s+/g, ' ')
    .replace(/ /g, ' ')
    .trim();
}

async function fetchViaHttp(url: string): Promise<UrlContent | null> {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html') && !ct.includes('text')) return null;
    const html = await res.text();
    if (!html || html.length < 50) return null;
    const $ = cheerio.load(html);
    let title = $('title').first().text().trim();
    if (!title) {
      title = $('meta[property="og:title"]').attr('content')?.trim() || '';
    }
    if (!title) {
      title = $('h1').first().text().trim();
    }
    const text = extractText($);
    if (!text) return null;
    return {
      title: title.slice(0, 200) || url,
      text_excerpt: text.slice(0, MAX_EXCERPT),
      source_url: url,
      fetched_via: 'http',
    };
  } catch (e) {
    console.error('[fetch_url_content/http]', (e as Error).message);
    return null;
  }
}

export async function fetchUrlContent(url: string): Promise<UrlContent | null> {
  if (!url || typeof url !== 'string') return null;
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  try {
    new URL(normalized);
  } catch {
    return null;
  }
  const cacheKey = normalized.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }
  // Étape 1 : HTTP léger via cheerio
  const result = await fetchViaHttp(normalized);
  // Étape 2 (TODO browser headless) : si result===null ou text trop court,
  // un futur service Playwright pourrait être appelé ici. Pour l'instant on
  // retourne ce qu'on a (souvent suffisant pour wiki/blogs/docs).
  cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}
