/**
 * Talk2Me #422 — POST /api/music/play
 * Enregistre une écoute pour le Memory Score de l'utilisateur (déclenché par ▶
 * dans la liste Music Card). Auth user obligatoire (cookie session).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { logPlay } from '@/lib/memory-score';

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
  if (!youtube_video_id) {
    return NextResponse.json({ error: 'youtube_video_id required' }, { status: 400 });
  }

  const seconds = typeof body?.seconds === 'number' ? body.seconds : 0;
  logPlay(
    me.id,
    {
      track_id: typeof body?.track_id === 'number' ? body.track_id : null,
      youtube_video_id,
      title: typeof body?.title === 'string' ? body.title : null,
      artist_name: typeof body?.artist_name === 'string' ? body.artist_name : null,
      genre: typeof body?.genre === 'string' ? body.genre : null,
    },
    Date.now(),
    seconds
  );

  return NextResponse.json({ ok: true });
}
