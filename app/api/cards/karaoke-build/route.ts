/**
 * POST /api/cards/karaoke-build (Pascal 2026-07-13)
 * Reçoit les fragments OCR (captions scannées d'UNE vidéo) : { videoId, fragments:[{text,t}] }.
 * Accumule par entité (crowd), et quand il y a assez de matière → l'IA RECONSTRUIT le karaoké
 * propre (texte + timing exacts de CETTE vidéo, live/remix inclus) → stocké source 'ocr-ai',
 * offset 0 = calé pile (les temps SONT les temps vidéo). lrclib = juste référence d'orthographe.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addOcrFragments, getOcrFragments, getLyrics, setLyrics, setLyricsOffset } from '@/lib/cards/engine/lyrics';
import { alignLyricsToVideo } from '@/lib/cards/engine/lyrics-sync';
import { reconstructKaraoke } from '@/lib/cards/engine/karaoke-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const buildingAt = new Map<string, number>(); // ref → nb de fragments à la dernière reconstruction

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return NextResponse.json({ error: 'bad_video' }, { status: 400 });
  const frags = Array.isArray(body?.fragments) ? body.fragments : [];
  const duration = typeof body?.duration === 'number' && body.duration > 1 ? body.duration : 0;
  const ref = `yt:${videoId}`;

  const total = addOcrFragments(ref, frags);

  // Reconstruire quand : assez de matière (≥6) ET (jamais fait OU +8 fragments depuis).
  const last = buildingAt.get(ref) ?? -999;
  const shouldBuild = total >= 6 && total - last >= (last < 0 ? 0 : 8);
  if (!shouldBuild) return NextResponse.json({ ok: true, fragments: total, built: false });

  buildingAt.set(ref, total);
  const allFrags = getOcrFragments(ref); // TOUS les fragments accumulés (crowd), pas juste ce POST
  const lrclib = getLyrics(ref) || [];

  // MÉTHODE PRINCIPALE (simple, robuste) : lrclib a le TEXTE propre+complet, l'OCR a les TEMPS vidéo.
  // On colle : chaque ligne lrclib → son temps vidéo (ancres OCR + interpolation). Pas d'IA. Pascal 2026-07-13.
  let lines = lrclib.length >= 4 ? alignLyricsToVideo(lrclib, allFrags) : [];
  let via = 'lrclib+ocr';
  // SECOURS (live / remix / lrclib absent) : lrclib ne colle pas → l'IA reconstruit depuis l'OCR seul.
  if (lines.length < 4) { lines = await reconstructKaraoke(allFrags, lrclib.length ? lrclib : undefined); via = 'ocr-ai'; }

  // GATE DE COMPLÉTUDE (Pascal 2026-07-13) : on ne CALE (→ notre karaoké synchro s'affiche) QUE si
  // les fragments couvrent ~la FIN de la chanson. Sinon (scan partiel, ou pollué par un autre post)
  // on garde les lignes pour la SLIDE LECTURE mais calibrated=false → CC natif YouTube tant que ce
  // n'est pas complet. Signal : le fragment le plus tardif atteint ≥90% de la durée de la vidéo.
  const maxFragT = allFrags.reduce((m, f) => (f.t > m ? f.t : m), 0);
  const complete = duration > 1 && maxFragT >= 0.9 * duration;

  console.log(`[KARAOKE-BUILD] ${ref} frags=${total} via=${via} → lines=${lines.length} maxT=${maxFragT.toFixed(0)} dur=${duration.toFixed(0)} complete=${complete}`);
  if (lines.length >= 4) {
    setLyrics(ref, lines, via);          // texte + timing vidéo réels (INSERT OR REPLACE → offset remis à NULL)
    if (complete) setLyricsOffset(ref, 0); // offset 0 = calé (les temps SONT les temps vidéo). Sinon reste NON calé.
    return NextResponse.json({ ok: true, fragments: total, built: true, via, lines: lines.length, coverage: duration > 1 ? Math.round((maxFragT / duration) * 100) : 0, calibrated: complete });
  }
  return NextResponse.json({ ok: true, fragments: total, built: false });
}
