/**
 * Wikipedia REST API "page summary" — sans clé, retourne titre, extrait, image.
 * Doctrine no-excuses : si pas trouvé, retourne null. JAMAIS d'invention.
 * Cache mémoire 24h.
 */

export interface WikipediaCardData {
  title: string;
  extract: string;
  thumbnail: string | null;
  page_url: string;
  lang: string;
  source: 'wikipedia';
}

interface CacheEntry {
  data: WikipediaCardData | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)';

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'fr,en;q=0.9',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(id);
  }
}

interface WikiSummary {
  type?: string;
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: {
    desktop?: { page?: string };
    mobile?: { page?: string };
  };
}

interface WikiSearchHit {
  title?: string;
}

interface WikiSearchResponse {
  pages?: WikiSearchHit[];
}

/** Cherche un titre via l'API search REST si le summary direct ne marche pas. */
async function findClosestTitle(topic: string, lang: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(topic)}&limit=1`;
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSearchResponse;
    const first = data?.pages?.[0]?.title;
    return typeof first === 'string' && first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

async function fetchSummary(title: string, lang: string): Promise<WikipediaCardData | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary;
    // Ignore disambiguation pages (rarement utiles à afficher)
    if (data.type === 'disambiguation') return null;
    const finalTitle = typeof data.title === 'string' ? data.title : title;
    const extract = typeof data.extract === 'string' ? data.extract.trim() : '';
    if (!finalTitle || extract.length === 0) return null;
    const thumb = typeof data.thumbnail?.source === 'string' ? data.thumbnail.source : null;
    const page_url =
      data.content_urls?.desktop?.page ||
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(finalTitle.replace(/\s+/g, '_'))}`;
    return {
      title: finalTitle,
      extract: extract.slice(0, 800),
      thumbnail: thumb,
      page_url,
      lang,
      source: 'wikipedia',
    };
  } catch {
    return null;
  }
}

export async function searchWikipedia(
  topic: string,
  lang: string = 'fr',
): Promise<WikipediaCardData | null> {
  if (!topic || topic.trim().length < 2) return null;
  const safeLang = /^[a-z]{2,3}$/.test(lang) ? lang : 'fr';
  const cacheKey = `${safeLang}|${topic.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // 1. Tentative directe sur le titre fourni
  let result = await fetchSummary(topic.trim(), safeLang);
  // 2. Fallback : passer par l'endpoint search pour récupérer un titre canonique
  if (!result) {
    const found = await findClosestTitle(topic.trim(), safeLang);
    if (found) {
      result = await fetchSummary(found, safeLang);
    }
  }
  // 3. Si fr échoue, dernier essai sur en (utile pour pop culture / persons)
  if (!result && safeLang !== 'en') {
    const found = await findClosestTitle(topic.trim(), 'en');
    if (found) {
      result = await fetchSummary(found, 'en');
    }
  }

  cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}
