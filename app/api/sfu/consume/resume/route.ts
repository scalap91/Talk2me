/**
 * POST /api/sfu/consume/resume
 *
 * Body : { activity_id, consumer_id }
 * Le client appelle ça après avoir attach le track au DOM, pour que
 * mediasoup démarre le RTP (les consumers sont créés paused).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, getOrCreatePeer, resumeConsumer } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { activity_id?: unknown; consumer_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';
  const consumerId = typeof body.consumer_id === 'string' ? body.consumer_id : '';
  if (!consumerId) return NextResponse.json({ error: 'invalid_params' }, { status: 400 });

  const auth = authForActivity(request, activityId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const room = getRoom(auth.ctx.activityId);
  if (!room) return NextResponse.json({ error: 'room_not_joined' }, { status: 400 });
  const peer = getOrCreatePeer(room, auth.ctx.me.id);

  try {
    await resumeConsumer(peer, consumerId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] consume/resume failed', msg);
    return NextResponse.json({ error: 'consume_resume_failed', detail: msg }, { status: 500 });
  }
}
