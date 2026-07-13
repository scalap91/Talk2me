/**
 * POST /api/cards/lyrics-sync (Pascal 2026-07-13)
 * Reçoit les lectures OCR de la caption YouTube récoltées par un tél du pool :
 *   { videoId, samples: [{ text, time }] }
 * → fuzzy-match chaque lecture contre les lignes lrclib de l'entité → MÉDIANE de l'offset
 * (temps vidéo − timestamp lrclib) → stocke l'offset sur l'entité `yt:<id>`.
 * Résultat : paroles = TEXTE lrclib propre + TIMING vidéo. Fait une fois, partagé (crowd).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getLyrics, hasOffset, setLyricsOffset } from '@/lib/cards/engine/lyrics';
import { computeOffset, type OcrSample } from '@/lib/cards/engine/lyrics-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return NextResponse.json({ error: 'bad_video' }, { status: 400 });

  const raw = Array.isArray(body?.samples) ? body.samples : [];
  const samples: OcrSample[] = raw
    .filter((s: unknown): s is OcrSample => !!s && typeof (s as OcrSample).text === 'string' && typeof (s as OcrSample).time === 'number')
    .slice(0, 200);

  const ref = `yt:${videoId}`;
  const cues = getLyrics(ref);
  if (!cues || !cues.length) return NextResponse.json({ ok: false, reason: 'no_lrclib' });
  if (hasOffset(ref)) return NextResponse.json({ ok: true, reason: 'already_calibrated', calibrated: true });

  const { offset, matches, deltas } = computeOffset(cues, samples);
  console.log(`[LYRICS-SYNC] ${ref} samples=${samples.length} matches=${matches} offset=${offset}`);
  if (offset === null) return NextResponse.json({ ok: false, reason: 'not_enough_matches', matches, deltas });

  setLyricsOffset(ref, offset * 1000);
  return NextResponse.json({ ok: true, calibrated: true, offsetSec: offset, matches });
}
