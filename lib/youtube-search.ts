export interface YouTubeVideo {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string;
}

export type YouTubeSearchResult =
  | { video: YouTubeVideo }
  | { error: 'not_found' | 'bad_query' };

// Cache interne : Map keyée par query en minuscules, avec TTL
const cache = new Map<string, { data: YouTubeSearchResult; expiry: number }>();
const CACHE_TTL = 600_000; // 10 minutes

interface YtRun {
  text?: string;
}

interface YtRuns {
  runs?: YtRun[];
}

interface YtVideoRenderer {
  videoId?: string;
  title?: YtRuns;
  longBylineText?: YtRuns;
  ownerText?: YtRuns;
}

interface YtSectionItem {
  videoRenderer?: YtVideoRenderer;
}

interface YtItemSection {
  itemSectionRenderer?: { contents?: YtSectionItem[] };
}

interface YtInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: YtItemSection[];
        };
      };
    };
  };
}

interface YtApiItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
  };
}

interface YtApiResponse {
  items?: YtApiItem[];
}

/**
 * Effectue une requête HTTP avec timeout.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  options?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie que la miniature existe via un HEAD request.
 */
async function thumbnailExists(videoId: string): Promise<boolean> {
  const url = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const response = await fetchWithTimeout(url, 4000, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Chemin A : Utilise l'API YouTube Data v3.
 */
async function searchYouTubeApi(query: string): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { error: 'not_found' };
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&type=video&maxResults=1&key=${apiKey}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, 8000);
  } catch {
    return { error: 'not_found' };
  }

  if (!response.ok) {
    return { error: 'not_found' };
  }

  let data: YtApiResponse;
  try {
    data = (await response.json()) as YtApiResponse;
  } catch {
    return { error: 'not_found' };
  }

  if (!data.items || data.items.length === 0) {
    return { error: 'not_found' };
  }

  const item = data.items[0];
  const videoId = item.id?.videoId;
  if (!videoId) {
    return { error: 'not_found' };
  }

  const thumbOk = await thumbnailExists(videoId);
  if (!thumbOk) {
    return { error: 'not_found' };
  }

  const title = item.snippet?.title ?? '';
  const channel = item.snippet?.channelTitle ?? '';
  const description = (item.snippet?.description ?? '').slice(0, 200);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    video: { video_id: videoId, title, channel, description, thumbnail },
  };
}
/**
 * Fonction principale de recherche YouTube.
 */
export async function searchYouTube(query: string): Promise<YouTubeSearchResult> {
  if (!query || query.trim().length === 0 || query.length > 200) {
    return { error: 'bad_query' };
  }

  const cacheKey = query.toLowerCase().trim();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  let result: YouTubeSearchResult;
  try {
    if (process.env.YOUTUBE_API_KEY) {
      result = await searchYouTubeApi(query);
    } else {
      // On NE SCRAPE PLUS youtube.com/results : Google bannit notre IP (« trafic exceptionnel »),
      // c'est fragile et hors-ToS. Sans clé API → zéro résultat (grounding). Configure
      // YOUTUBE_API_KEY pour réactiver la recherche YouTube. Pascal 2026-08-30.
      result = { error: 'not_found' };
    }
  } catch (err) {
    console.error('[yt-search]', err);
    result = { error: 'not_found' };
  }

  cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL });
  return result;
}

// ===================== MULTI-RESULTS (Phase 5 VideoPicker) =====================

export type YouTubeMultiResult =
  | { videos: YouTubeVideo[] }
  | { error: 'not_found' | 'bad_query' };

const multiCache = new Map<string, { data: YouTubeMultiResult; expiry: number }>();

async function searchYouTubeApiMulti(
  query: string,
  limit: number
): Promise<YouTubeMultiResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { error: 'not_found' };
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&type=video&maxResults=${limit}&key=${apiKey}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, 8000);
  } catch {
    return { error: 'not_found' };
  }
  if (!response.ok) return { error: 'not_found' };
  let data: YtApiResponse;
  try {
    data = (await response.json()) as YtApiResponse;
  } catch {
    return { error: 'not_found' };
  }
  if (!data.items || data.items.length === 0) return { error: 'not_found' };
  const videos: YouTubeVideo[] = [];
  for (const item of data.items) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const title = item.snippet?.title ?? '';
    const channel = item.snippet?.channelTitle ?? '';
    const description = (item.snippet?.description ?? '').slice(0, 200);
    videos.push({
      video_id: videoId,
      title,
      channel,
      description,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
  return videos.length > 0 ? { videos } : { error: 'not_found' };
}
/**
 * Recherche YouTube multi-résultats (Phase 5 VideoPicker activité partagée).
 * `limit` par défaut 5, max 10. Cache 10 min.
 */
export async function searchYouTubeMulti(
  query: string,
  limit = 5
): Promise<YouTubeMultiResult> {
  if (!query || query.trim().length === 0 || query.length > 200) {
    return { error: 'bad_query' };
  }
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const key = `${query.toLowerCase().trim()}::${safeLimit}`;
  const cached = multiCache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data;

  let res: YouTubeMultiResult;
  try {
    if (process.env.YOUTUBE_API_KEY) {
      res = await searchYouTubeApiMulti(query, safeLimit);
    } else {
      res = { error: 'not_found' }; // plus de scraping YouTube (anti-ban Google). Cf. searchYouTube. Pascal 2026-08-30.
    }
  } catch (err) {
    console.error('[yt-search-multi]', err);
    res = { error: 'not_found' };
  }
  multiCache.set(key, { data: res, expiry: Date.now() + CACHE_TTL });
  return res;
}
