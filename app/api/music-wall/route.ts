/**
 * Talk2Me — GET /api/music-wall (Pascal 2026-06-13).
 * Remplit la PIÈCE-POST 3D avec une playlist YouTube (vignettes aux murs).
 *
 * mode=top (défaut) : TA vraie top list perso = tes écoutes (music_play_events,
 *   pondérées plays + secondes) boostées par tes scores manuels (music_manual_score).
 *   Fallback sur le top de la biblio music-hub si pas connecté / pas d'historique.
 * mode=popular : top mondial de la biblio (view_count).
 *
 * → { ok, mode, tracks: [{ id, title, channel, thumb }] }  (id = youtube_video_id)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { getCurrentUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MUSIC_DB = '/home/ubuntu/music-hub/data/music.db';
const T2M_DB = process.cwd() + '/data/talktome.db';

type Track = { id: string; title: string; channel: string; thumb: string };

/** Top mondial de la biblio music-hub (view_count). */
function popularTracks(limit: number): Omit<Track, 'thumb'>[] {
  if (!existsSync(MUSIC_DB)) return [];
  const db = new Database(MUSIC_DB, { readonly: true, fileMustExist: true });
  const rows = db.prepare(
    `SELECT youtube_video_id AS id, title, channel_title AS channel
     FROM tracks WHERE youtube_video_id IS NOT NULL
     ORDER BY (view_count IS NULL), view_count DESC LIMIT ?`
  ).all(limit) as Omit<Track, 'thumb'>[];
  db.close();
  return rows;
}

/** TA top list perso : écoutes pondérées + boost scores manuels. */
function personalTop(userId: string, limit: number): Omit<Track, 'thumb'>[] {
  if (!existsSync(T2M_DB)) return [];
  const db = new Database(T2M_DB, { readonly: true, fileMustExist: true });
  // score = plays + secondes/180 (≈ une écoute complète) + score manuel
  const rows = db.prepare(
    `SELECT e.youtube_video_id AS id,
            MAX(e.title)        AS title,
            MAX(e.artist_name)  AS channel,
            COUNT(*)            AS plays,
            COALESCE(SUM(e.seconds_listened),0) AS secs,
            COALESCE((SELECT s.score FROM music_manual_score s
                      WHERE s.user_id = e.user_id
                        AND s.youtube_video_id = e.youtube_video_id), 0) AS manual
     FROM music_play_events e
     WHERE e.user_id = ? AND e.youtube_video_id IS NOT NULL
     GROUP BY e.youtube_video_id
     ORDER BY (plays + secs/180.0 + manual) DESC
     LIMIT ?`
  ).all(userId, limit) as (Omit<Track, 'thumb'> & { plays: number })[];
  db.close();
  return rows.map(({ id, title, channel }) => ({ id, title: title || 'Sans titre', channel: channel || '' }));
}

/** Récupère une vignette YouTube côté serveur → data-URI (évite le CORS WebGL). */
async function withThumb(rows: Omit<Track, 'thumb'>[]): Promise<Track[]> {
  const out = await Promise.all(rows.map(async (t) => {
    const url = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
    let dataUri = '';
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const ct = r.headers.get('content-type') || 'image/jpeg';
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 256) dataUri = `data:${ct};base64,${b.toString('base64')}`;
      }
    } catch { /* vignette manquante = ignorée */ }
    return { id: t.id, title: t.title, channel: t.channel, thumb: dataUri };
  }));
  return out.filter((t) => t.thumb);
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(24, Math.max(4, Number(sp.get('limit')) || 18));
  const mode = sp.get('mode') === 'popular' ? 'popular' : 'top';
  const targetUser = sp.get('user'); // top d'un user PRÉCIS (le propriétaire de la salle)
  try {
    let rows: Omit<Track, 'thumb'>[] = [];
    let used = mode;
    if (mode === 'top') {
      const uid = targetUser || getCurrentUserFromRequest(req)?.id;
      if (uid) rows = personalTop(uid, limit);
      if (rows.length === 0) { rows = popularTracks(limit); used = 'popular'; } // fallback
    } else {
      rows = popularTracks(limit);
    }
    const tracks = await withThumb(rows);
    return NextResponse.json({ ok: true, mode: used, tracks });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, tracks: [] });
  }
}
