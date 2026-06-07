/**
 * TikTok search — recherche vidéos par mots-clés (mission Pascal 2026-06-04).
 *
 * Doctrine [[talktome-embeds-only]] + [[feedback_content_grounding]] :
 *   on N'INVENTE PAS de vidéos. On scrape une source réelle (tikwm.com,
 *   miroir public TikTok sans clé) et on retourne les métadonnées brutes
 *   pour render le lecteur officiel `tiktok.com/embed.js`.
 *
 * Stratégie :
 *   1. tikwm.com /api/feed/search (gratuit, sans clé, 5s timeout)
 *   2. Si KO → retourne null (le caller chaîne search_web "tiktok <query>"
 *      via consciousness.json fallback_chain).
 *
 * Aucun stockage de la vidéo : on persiste juste {video_id, user, …} et le
 * lecteur TikTok fait le lookup live à l'affichage.
 */

export interface TikTokVideo {
  video_id: string;
  user: string;
  user_nickname: string;
  title: string;
  cover_url: string | null;
  original_url: string;
  play_count: number | null;
  digg_count: number | null;
  duration: number | null;
}

interface TikwmAuthor {
  unique_id?: string;
  nickname?: string;
}

interface TikwmVideo {
  video_id?: string;
  id?: string;
  title?: string;
  author?: TikwmAuthor;
  cover?: string;
  origin_cover?: string;
  play_count?: number;
  digg_count?: number;
  duration?: number;
}

interface TikwmResponse {
  code?: number;
  msg?: string;
  data?: {
    videos?: TikwmVideo[];
  };
}

const CACHE_TTL = 600_000; // 10 min
const cache = new Map<string, { data: TikTokVideo[] | null; expiry: number }>();

function normalize(v: TikwmVideo): TikTokVideo | null {
  const videoId = (v.video_id || v.id || '').toString();
  if (!videoId) return null;
  const user = v.author?.unique_id || '';
  if (!user) return null;
  return {
    video_id: videoId,
    user,
    user_nickname: v.author?.nickname || user,
    title: typeof v.title === 'string' ? v.title : '',
    cover_url: typeof v.cover === 'string' ? v.cover : typeof v.origin_cover === 'string' ? v.origin_cover : null,
    original_url: `https://www.tiktok.com/@${user}/video/${videoId}`,
    play_count: typeof v.play_count === 'number' ? v.play_count : null,
    digg_count: typeof v.digg_count === 'number' ? v.digg_count : null,
    duration: typeof v.duration === 'number' ? v.duration : null,
  };
}

async function searchTiktokTikwm(query: string, limit: number): Promise<TikTokVideo[] | null> {
  const url = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${limit}&hd=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as TikwmResponse;
    if (data.code !== 0 || !Array.isArray(data.data?.videos) || data.data.videos.length === 0) {
      return null;
    }
    const out: TikTokVideo[] = [];
    for (const v of data.data.videos.slice(0, limit)) {
      const n = normalize(v);
      if (n) out.push(n);
    }
    return out.length > 0 ? out : null;
  } catch (e) {
    clearTimeout(t);
    console.error('[tiktok-search/tikwm]', (e as Error).message);
    return null;
  }
}

/**
 * Recherche TikTok par mots-clés. Limit 1-5 (clamp). Cache 10 min.
 * Retourne null si la source est down ou rien trouvé (doctrine no-excuses).
 */
export async function searchTiktok(query: string, limit = 5): Promise<TikTokVideo[] | null> {
  const q = (query || '').trim();
  if (!q || q.length > 200) return null;
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  const key = `${q.toLowerCase()}::${safeLimit}`;
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data;

  const videos = await searchTiktokTikwm(q, safeLimit);
  cache.set(key, { data: videos, expiry: Date.now() + CACHE_TTL });
  return videos;
}
