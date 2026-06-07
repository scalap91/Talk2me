/**
 * Talk2Me #422 — POST /api/music/reset
 * Retire un son de "Ton top" : son score repart à ZÉRO (suppression des écoutes
 * loggées + override manuel). Le son redevient un son normal de la bibliothèque.
 * Pascal 2026-06-07 : "swipe gauche supprime de mes top… son score revient à zéro".
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { resetTrackScore } from '@/lib/memory-score';

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

  resetTrackScore(me.id, youtube_video_id);
  return NextResponse.json({ ok: true });
}
