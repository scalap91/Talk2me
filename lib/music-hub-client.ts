/**
 * Talk2Me — Client HTTP music-hub (Pascal #422, 2026-06-06)
 *
 * Module isolé : http://127.0.0.1:3020/v1/, X-API-Key obligatoire.
 * Lit MUSIC_HUB_API_KEY + MUSIC_HUB_BASE_URL côté serveur uniquement.
 *
 * Cache mémoire LRU 5min (200 entries) sur les GET.
 *
 * Doctrine : si music-hub down, retourne `{ tracks: [] }` propre — pas d'exception
 * (graceful degradation, cf [[feedback-talk2me-no-excuses]]).
 */

export interface MusicHubTrack {
  id: number;
  youtube_video_id: string;
  youtube_url: string;
  title: string;
  artist_name: string;
  channel_id: string | null;
  channel_title: string | null;
  duration_sec: number | null;
  view_count: number;
  thumbnail_url: string | null;
  is_official: boolean;
  source: string;
  added_at: number;
}

interface MusicHubArtist {
  id: number;
  name: string;
  genre: string | null;
  popularity: number;
  first_letter: string;
  last_crawled_at: number | null;
}

const BASE_URL = process.env.MUSIC_HUB_BASE_URL ?? 'http://127.0.0.1:3020';
const API_KEY = process.env.MUSIC_HUB_API_KEY ?? '';
const TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // LRU touch
  cache.delete(key);
  cache.set(key, e);
  return e.data as T;
}

function cacheSet(key: string, data: unknown) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function call<T>(path: string, fallback: T): Promise<T> {
  if (!API_KEY) {
    // Mauvaise config silencieuse côté serveur — log dev only.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[music-hub-client] MUSIC_HUB_API_KEY not set');
    }
    return fallback;
  }
  const cacheKey = `GET ${path}`;
  const hit = cacheGet<T>(cacheKey);
  if (hit) return hit;

  const url = `${BASE_URL}/v1${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': API_KEY, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as T;
    cacheSet(cacheKey, json);
    return json;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export interface MusicHubTracksResponse {
  tracks: MusicHubTrack[];
  queued_for_crawl?: boolean;
  artist?: MusicHubArtist;
}

export interface MusicHubArtistsResponse {
  letter: string;
  artists: MusicHubArtist[];
}

export async function searchMusic(
  q: string,
  limit = 20,
): Promise<MusicHubTracksResponse> {
  if (!q.trim()) return { tracks: [] };
  return call(
    `/search?q=${encodeURIComponent(q)}&limit=${clamp(limit, 1, 50)}`,
    { tracks: [] } as MusicHubTracksResponse,
  );
}

export async function getByArtist(
  artist: string,
  limit = 20,
): Promise<MusicHubTracksResponse> {
  if (!artist.trim()) return { tracks: [] };
  return call(
    `/by-artist?artist=${encodeURIComponent(artist)}&limit=${clamp(limit, 1, 50)}`,
    { tracks: [] } as MusicHubTracksResponse,
  );
}

export async function getTrending(
  limit = 50,
): Promise<MusicHubTracksResponse> {
  return call(
    `/trending?limit=${clamp(limit, 1, 100)}`,
    { tracks: [] } as MusicHubTracksResponse,
  );
}

export async function getAlphabet(
  letter: string,
  limit = 20,
): Promise<MusicHubTracksResponse> {
  const l = (letter ?? '').toUpperCase().trim();
  if (!l) return { tracks: [] };
  return call(
    `/alphabet?letter=${encodeURIComponent(l)}&limit=${clamp(limit, 1, 100)}`,
    { tracks: [] } as MusicHubTracksResponse,
  );
}

export async function getArtists(
  letter: string,
  limit = 100,
): Promise<MusicHubArtistsResponse> {
  const l = (letter ?? '').toUpperCase().trim();
  if (!l) return { letter: '', artists: [] };
  return call(
    `/artists?letter=${encodeURIComponent(l)}&limit=${clamp(limit, 1, 500)}`,
    { letter: l, artists: [] } as MusicHubArtistsResponse,
  );
}

/**
 * Adapte un MusicHubTrack → UnifiedCard pour stockage dans
 * attached_audio_json + render front. Compatible embed-hub.
 */
import type { UnifiedCard } from '@/lib/embed-hub/types';
export function trackToUnifiedCard(t: MusicHubTrack): UnifiedCard {
  return {
    source: 'youtube',
    source_label: 'YouTube Music',
    type: 'audio',
    title: t.title,
    author: { name: t.artist_name },
    thumbnail_url: t.thumbnail_url ?? undefined,
    description: t.artist_name,
    external_url: t.youtube_url,
    embed: {
      kind: 'iframe',
      src: `https://www.youtube.com/embed/${t.youtube_video_id}?modestbranding=1&rel=0`,
      aspect_ratio: '16 / 9',
      allow_fullscreen: true,
    },
    meta: {
      youtube_video_id: t.youtube_video_id,
      duration_sec: t.duration_sec,
      is_official: t.is_official,
      music_hub_track_id: t.id,
    },
    actions: [
      { kind: 'open', label: 'Voir sur YouTube', url: t.youtube_url },
      { kind: 'save', label: 'Enregistrer' },
    ],
  };
}

function clamp(n: number, min: number, max: number): number {
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
