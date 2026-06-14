'use server-only';

/**
 * Studio Vidéo IA — clips VIDÉO de fond (Pascal 2026-06-11, « passe le moteur aux
 * clips vidéo qui bougent »). Équivalent de l'étape InVideo de la masterclass :
 * on récupère de vrais clips de stock qui bougent, par mot-clé, et on les monte.
 * Sources GRATUITES gated sur clé : Pexels Video (PEXELS_API_KEY) puis Pixabay
 * (PIXABAY_API_KEY). Sans clé → null (le moteur retombe sur les images fixes).
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const DIR = '/home/ubuntu/talktome/public/uploads/aivid-clip';

export function isVideoStockEnabled(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}

async function dl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Talk2Me-VideoStudio/1.0' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('video/') && !url.match(/\.(mp4|webm)(\?|$)/i)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 50_000) return null; // trop petit = pas une vraie vidéo
    if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });
    const out = path.join(DIR, `${randomUUID()}.mp4`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/** Pexels Video : choisit le mp4 dont la hauteur colle le mieux à la cible. */
async function fromPexels(query: string, portrait: boolean, userKey?: string): Promise<string | null> {
  const key = userKey || process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${portrait ? 'portrait' : 'landscape'}&size=medium`;
    const res = await fetch(u, { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { videos?: { video_files?: { link: string; width: number; height: number; file_type: string }[] }[] };
    for (const v of data.videos || []) {
      const mp4s = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.height);
      if (!mp4s.length) continue;
      // cible ~1280 de hauteur (portrait) / ~720 (paysage), prend le plus proche ≤ 1920
      const target = portrait ? 1280 : 720;
      mp4s.sort((a, b) => Math.abs(a.height - target) - Math.abs(b.height - target));
      const pick = mp4s.find((f) => f.height <= 1920) || mp4s[0];
      const local = await dl(pick.link);
      if (local) return local;
    }
  } catch { /* ignore */ }
  return null;
}

/** Pixabay Video : fallback. */
async function fromPixabay(query: string): Promise<string | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  try {
    const u = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=5&safesearch=true`;
    const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { hits?: { videos?: Record<string, { url: string; width: number }> }[] };
    for (const h of data.hits || []) {
      const v = h.videos?.large || h.videos?.medium || h.videos?.small;
      if (!v?.url) continue;
      const local = await dl(v.url);
      if (local) return local;
    }
  } catch { /* ignore */ }
  return null;
}

/** Cherche un clip vidéo de fond. portrait=true pour 9:16. keys = clés de l'user (BYOK). */
export async function fetchBackgroundVideo(query: string, portrait: boolean, keys?: { pexels?: string }): Promise<string | null> {
  const q = (query || '').trim();
  if (!q) return null;
  return (await fromPexels(q, portrait, keys?.pexels)) || (await fromPixabay(q));
}

/** Vrai si des clips vidéo sont possibles : clé user OU plateforme. */
export function videoStockAvailable(userPexels?: string | null): boolean {
  return !!(userPexels || process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}
