/**
 * Talk2Me — YouTube Data API : DÉTAILS OFFICIELS d'une vidéo par ID (Pascal 2026-07-08).
 * Source de vérité GROUNDED pour une entité vidéo : titre, chaîne, date de publication,
 * vues, likes, description officielle, tags, durée. On INTERROGE la source, on ne scrape
 * jamais. Pas de clé YOUTUBE_API_KEY → renvoie null (dégradation propre, aucun faux).
 * Alimente : M2 (vérif des faits d'une vidéo), amorçage d'article, M7 (clips).
 */
export interface YouTubeVideoDetails {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string; // ISO 8601
  description: string;
  viewCount: number | null;
  likeCount: number | null;
  tags: string[];
  duration: string; // ISO 8601 (PT4M12S…)
  thumbnail: string | null;
}

const cache = new Map<string, { data: YouTubeVideoDetails | null; at: number }>();
const TTL = 6 * 60 * 60 * 1000; // 6 h : les stats bougent lentement

export async function getYouTubeVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
  const id = (videoId || '').trim();
  if (!id) return null;
  // Accepte les deux noms rencontrés dans le projet (talktome + music-hub).
  const key = (process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY)?.trim();
  if (!key) return null; // pas de clé → pas d'invention

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < TTL) return cached.data;

  try {
    const url =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      cache.set(id, { data: null, at: Date.now() });
      return null;
    }
    const j = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          channelTitle?: string;
          channelId?: string;
          publishedAt?: string;
          description?: string;
          tags?: string[];
          thumbnails?: Record<string, { url?: string }>;
        };
        statistics?: { viewCount?: string; likeCount?: string };
        contentDetails?: { duration?: string };
      }>;
    };
    const item = j.items?.[0];
    if (!item) {
      cache.set(id, { data: null, at: Date.now() });
      return null;
    }
    const sn = item.snippet || {};
    const st = item.statistics || {};
    const cd = item.contentDetails || {};
    const details: YouTubeVideoDetails = {
      id,
      title: sn.title || '',
      channelTitle: sn.channelTitle || '',
      channelId: sn.channelId || '',
      publishedAt: sn.publishedAt || '',
      description: sn.description || '',
      viewCount: st.viewCount != null ? Number(st.viewCount) : null,
      likeCount: st.likeCount != null ? Number(st.likeCount) : null,
      tags: Array.isArray(sn.tags) ? sn.tags : [],
      duration: cd.duration || '',
      thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
    };
    cache.set(id, { data: details, at: Date.now() });
    return details;
  } catch {
    return null;
  }
}

/** Résumé texte des faits OFFICIELS d'une vidéo — à donner comme preuve autoritative à Léa (M2). */
export function youtubeFactsBlock(d: YouTubeVideoDetails): string {
  const fr = (n: number | null) => (n == null ? 'n/a' : n.toLocaleString('fr-FR'));
  return [
    `Titre officiel : ${d.title}`,
    `Chaîne : ${d.channelTitle}`,
    `Date de publication : ${d.publishedAt}`,
    `Vues : ${fr(d.viewCount)} · Likes : ${fr(d.likeCount)}`,
    d.tags.length ? `Tags : ${d.tags.slice(0, 15).join(', ')}` : '',
    d.description ? `Description officielle :\n${d.description.slice(0, 1500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
