/**
 * /api/dev/backfill-enrich — ENRICHIT LES VIDÉOS/SONS DÉJÀ POSTÉS (Pascal 2026-07-11 « commence
 * déjà à enrichir mes vidéos postées »). Parcourt toutes les cards actives portant un son
 * (attached_audio_json), et pour chaque entité yt:<id> : génère l'article (auto-enrichi) + range les
 * paroles synchro (lrclib). Séquentiel = throttlé (ne martèle pas DeepSeek/lrclib). Dédup intégré
 * (article existant / paroles déjà tentées → sauté). Idempotent. Gate x-dev-secret.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { autoEnrichEntity } from '@/lib/cards/engine/auto-enrich';
import { autoLyricsForEntity } from '@/lib/cards/engine/lyrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-dev-secret') !== process.env.TEST_LOGIN_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const rows = getDb()
    .prepare("SELECT id, attached_audio_json, caption, text FROM direct_cards WHERE deleted_at IS NULL AND attached_audio_json IS NOT NULL")
    .all() as { id: string; attached_audio_json: string; caption: string | null; text: string | null }[];

  let sons = 0, enriched = 0, lyrics = 0;
  for (const r of rows) {
    try {
      const a = JSON.parse(r.attached_audio_json) as { video_id?: string; youtube_video_id?: string; title?: string; media?: { video_id?: string } };
      const vid = a.video_id || a.youtube_video_id || a.media?.video_id;
      if (!vid || !/^[A-Za-z0-9_-]{6,20}$/.test(vid)) continue;
      sons++;
      const title = (a.title || r.caption || r.text || 'Ce son').slice(0, 140);
      const ref = `yt:${vid}`;
      if (await autoEnrichEntity(ref, title)) enriched++;
      if (await autoLyricsForEntity(ref, title)) lyrics++;
    } catch {
      /* best-effort : une card qui échoue ne bloque pas le backfill */
    }
  }
  return NextResponse.json({ ok: true, total: rows.length, sons, enriched, lyrics });
}
