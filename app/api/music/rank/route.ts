/**
 * Talk2Me #422 — POST /api/music/rank
 * Glisser-déposer dans "Pour moi" : attribue un SCORE MANUEL à un son (entre
 * ses deux voisins). Ce score persiste ; la position est la conséquence du tri.
 * Pascal 2026-06-06 : "c'est le bonus qui persiste, pas la position".
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setManualScore } from '@/lib/memory-score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const youtube_video_id =
    typeof body?.youtube_video_id === 'string' ? body.youtube_video_id : '';
  const score = typeof body?.score === 'number' ? body.score : NaN;
  if (!youtube_video_id || !Number.isFinite(score)) {
    return NextResponse.json({ error: 'youtube_video_id and score required' }, { status: 400 });
  }

  setManualScore(
    me.id,
    {
      youtube_video_id,
      score,
      title: typeof body?.title === 'string' ? body.title : null,
      artist_name: typeof body?.artist_name === 'string' ? body.artist_name : null,
      genre: typeof body?.genre === 'string' ? body.genre : null,
    },
    Date.now()
  );

  return NextResponse.json({ ok: true });
}
