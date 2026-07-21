/**
 * /api/dev/normalize-uploads — RATTRAPAGE lisibilité NATIVE des vidéos déjà uploadées.
 *
 * Contexte (Pascal 2026-07-21) : le composer web produit de l'audio OPUS dans un MP4 → Chrome le
 * lit, mais les lecteurs NATIFS (Android ExoPlayer / iOS AVPlayer) échouent → « Vidéo illisible ».
 * `ensureNativePlayable` transcode l'audio en AAC (vidéo h264 copiée, sans perte). L'upload le fait
 * désormais à la source ; ici on repasse sur l'EXISTANT, par lots (resumable via ?offset).
 *
 * Idempotent : un fichier déjà h264/AAC est laissé intact. Ne touche PAS les .card (le fichier garde
 * la même URL /uploads/xxx.mp4) — le lecteur unique n'est pas concerné.
 *
 * Gate léger : session valide requise (POST). Un lot = ?limit fichiers à partir de ?offset.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { ensureNativePlayable } from '@/lib/ffmpeg-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v']);

export async function POST(req: NextRequest) {
  if (!getCurrentUserFromRequest(req)) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(Math.max(1, parseInt(sp.get('limit') ?? '25', 10) || 25), 100);

  let all: string[];
  try {
    all = (await readdir(UPLOAD_DIR))
      .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()) && !f.startsWith('.'))
      .sort();
  } catch (e) {
    return NextResponse.json({ error: 'readdir_failed', detail: String(e) }, { status: 500 });
  }

  const batch = all.slice(offset, offset + limit);
  let converted = 0, skipped = 0, failed = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const f of batch) {
    try {
      const r = await ensureNativePlayable(path.join(UPLOAD_DIR, f));
      if (r.converted) converted++; else skipped++;
    } catch (e) {
      failed++;
      errors.push({ file: f, error: String(e).slice(0, 200) });
    }
  }

  const nextOffset = offset + batch.length;
  return NextResponse.json({
    total: all.length,
    offset,
    processed: batch.length,
    converted,
    skipped,
    failed,
    errors: errors.slice(0, 10),
    nextOffset,
    done: nextOffset >= all.length,
  });
}
