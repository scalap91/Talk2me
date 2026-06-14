'use server-only';

/**
 * Studio Vidéo IA — banque d'images de fond GRATUITE (Pascal 2026-06-10).
 * Pour donner de vraies images aux vidéos sans clé payante : Openverse
 * (images Creative Commons, api.openverse.org, sans clé) + fallback Wikimedia
 * Commons. Télécharge l'image en local et renvoie le chemin absolu (ou null).
 * Grounding : images réelles tirées d'une banque, pas d'invention.
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const DIR = '/home/ubuntu/talktome/public/uploads/aivid-img';

async function dl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Talk2Me-VideoStudio/1.0 (contact: pascal.repir@gmail.com)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2048) return null; // trop petit = icône/placeholder
    if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const out = path.join(DIR, `${randomUUID()}.${ext}`);
    await writeFile(out, buf);
    return out;
  } catch {
    return null;
  }
}

/** Openverse : recherche d'images CC, sans clé. (Pas de filtre aspect_ratio :
 *  il élaguait presque tout — on recadre côté ffmpeg de toute façon.) */
async function fromOpenverse(query: string): Promise<string | null> {
  try {
    const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false&license_type=all`;
    const res = await fetch(u, {
      headers: { 'User-Agent': 'Talk2Me-VideoStudio/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { url?: string }[] };
    for (const r of data.results || []) {
      if (!r.url) continue;
      const local = await dl(r.url);
      if (local) return local;
    }
  } catch { /* ignore */ }
  return null;
}

/** Wikimedia Commons : fallback (recherche fichiers image). */
async function fromWikimedia(query: string): Promise<string | null> {
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&prop=imageinfo&iiprop=url&iiurlwidth=1280`;
    const res = await fetch(u, { headers: { 'User-Agent': 'Talk2Me-VideoStudio/1.0' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> } };
    const pages = data.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const ii = pages[k].imageinfo?.[0];
      const url = ii?.thumburl || ii?.url;
      if (!url) continue;
      const local = await dl(url);
      if (local) return local;
    }
  } catch { /* ignore */ }
  return null;
}

/** Cherche une image de fond pour un mot-clé. Retourne chemin local ou null. */
export async function fetchBackgroundImage(query: string): Promise<string | null> {
  const q = (query || '').trim();
  if (!q) return null;
  return (await fromOpenverse(q)) || (await fromWikimedia(q));
}
