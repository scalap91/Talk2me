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
 * Décode les séquences d'échappement Unicode (ex: é -> é).
 */
function decodeUnicode(raw: string): string {
  return raw.replace(/\\u[0-9a-fA-F]{4}/g, (match) => {
    return String.fromCharCode(parseInt(match.slice(2), 16));
  });
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
 * Chemin B : Scrape la page de recherche YouTube.
 */
async function searchYouTubeScrape(query: string): Promise<YouTubeSearchResult> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, 8000, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr,en;q=0.9',
      },
    });
  } catch {
    return { error: 'not_found' };
  }

  if (!response.ok) {
    return { error: 'not_found' };
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    return { error: 'not_found' };
  }

  // Extraction du JSON ytInitialData (assignation var ytInitialData = {...};)
  const ytInitialDataMatch = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});/);
  if (ytInitialDataMatch) {
    let initialData: YtInitialData;
    try {
      initialData = JSON.parse(ytInitialDataMatch[1]) as YtInitialData;
    } catch {
      // fallback regex below
      initialData = {};
    }

    const contents =
      initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents;
    if (Array.isArray(contents)) {
      for (const section of contents) {
        const items = section?.itemSectionRenderer?.contents;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          const vr = item?.videoRenderer;
          if (!vr || !vr.videoId) continue;

          const videoId = vr.videoId;

          const titleRuns = vr.title?.runs;
          let title = '';
          if (Array.isArray(titleRuns)) {
            title = titleRuns.map((r) => r.text ?? '').join('');
          }

          let channel = '';
          const longBy = vr.longBylineText?.runs;
          if (Array.isArray(longBy) && longBy.length > 0) {
            channel = longBy.map((r) => r.text ?? '').join('');
          } else {
            const owner = vr.ownerText?.runs;
            if (Array.isArray(owner) && owner.length > 0) {
              channel = owner.map((r) => r.text ?? '').join('');
            }
          }

          title = decodeUnicode(title);
          channel = decodeUnicode(channel);

          const thumbOk = await thumbnailExists(videoId);
          if (!thumbOk) continue;

          return {
            video: {
              video_id: videoId,
              title,
              channel,
              description: '',
              thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            },
          };
        }
      }
    }
  }

  // Fallback regex simple si ytInitialData absent ou structure inattendue
  const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  if (!idMatch) {
    return { error: 'not_found' };
  }
  const videoId = idMatch[1];
  const videoIdIndex = html.indexOf(idMatch[0]);
  const slice = html.slice(videoIdIndex, videoIdIndex + 4000);

  let title = '';
  const titleMatch = slice.match(/"title":\s*\{"runs":\s*\[\{"text":"([^"]+)"/);
  if (titleMatch) title = decodeUnicode(titleMatch[1]);

  let channel = '';
  const channelMatch =
    slice.match(/"longBylineText":\s*\{"runs":\s*\[\{"text":"([^"]+)"/) ||
    slice.match(/"ownerText":\s*\{"runs":\s*\[\{"text":"([^"]+)"/);
  if (channelMatch) channel = decodeUnicode(channelMatch[1]);

  const thumbOk = await thumbnailExists(videoId);
  if (!thumbOk) return { error: 'not_found' };

  return {
    video: {
      video_id: videoId,
      title,
      channel,
      description: '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    },
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
      result = await searchYouTubeScrape(query);
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

async function searchYouTubeScrapeMulti(
  query: string,
  limit: number
): Promise<YouTubeMultiResult> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, 8000, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr,en;q=0.9',
      },
    });
  } catch {
    return { error: 'not_found' };
  }
  if (!response.ok) return { error: 'not_found' };
  let html: string;
  try {
    html = await response.text();
  } catch {
    return { error: 'not_found' };
  }

  const out: YouTubeVideo[] = [];
  const seen = new Set<string>();

  const m = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});/);
  if (m) {
    try {
      const initial: YtInitialData = JSON.parse(m[1]);
      const contents =
        initial?.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents;
      if (Array.isArray(contents)) {
        outer: for (const section of contents) {
          const items = section?.itemSectionRenderer?.contents;
          if (!Array.isArray(items)) continue;
          for (const it of items) {
            const vr = it?.videoRenderer;
            if (!vr || !vr.videoId) continue;
            if (seen.has(vr.videoId)) continue;
            const videoId = vr.videoId;
            const titleRuns = vr.title?.runs;
            let title = '';
            if (Array.isArray(titleRuns)) title = titleRuns.map((r) => r.text ?? '').join('');
            let channel = '';
            const longBy = vr.longBylineText?.runs;
            if (Array.isArray(longBy) && longBy.length > 0) {
              channel = longBy.map((r) => r.text ?? '').join('');
            } else {
              const owner = vr.ownerText?.runs;
              if (Array.isArray(owner) && owner.length > 0) {
                channel = owner.map((r) => r.text ?? '').join('');
              }
            }
            title = decodeUnicode(title);
            channel = decodeUnicode(channel);
            seen.add(videoId);
            out.push({
              video_id: videoId,
              title,
              channel,
              description: '',
              thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            });
            if (out.length >= limit) break outer;
          }
        }
      }
    } catch {
      // fallback regex
    }
  }

  // Fallback regex sur tous les videoId rencontrés si on n'a rien
  if (out.length === 0) {
    const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(html)) !== null && out.length < limit) {
      const id = mm[1];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        video_id: id,
        title: '',
        channel: '',
        description: '',
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      });
    }
  }

  return out.length > 0 ? { videos: out } : { error: 'not_found' };
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
      res = await searchYouTubeScrapeMulti(query, safeLimit);
    }
  } catch (err) {
    console.error('[yt-search-multi]', err);
    res = { error: 'not_found' };
  }
  multiCache.set(key, { data: res, expiry: Date.now() + CACHE_TTL });
  return res;
}
