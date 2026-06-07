/**
 * POST /api/sfu/transport/create
 *
 * Crée un WebRtcTransport mediasoup pour le peer (send ou recv).
 * Body : { activity_id: string, direction: 'send' | 'recv' }
 * Réponse : { id, iceParameters, iceCandidates, dtlsParameters }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, getOrCreatePeer, createWebRtcTransport } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { activity_id?: unknown; direction?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';
  const direction = body.direction === 'recv' ? 'recv' : 'send';

  const auth = authForActivity(request, activityId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const room = getRoom(auth.ctx.activityId);
  if (!room) {
    return NextResponse.json({ error: 'room_not_joined' }, { status: 400 });
  }
  const peer = getOrCreatePeer(room, auth.ctx.me.id);

  try {
    const params = await createWebRtcTransport(room, peer, direction);
    return NextResponse.json({ ok: true, transport: params });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] transport/create failed', msg);
    return NextResponse.json({ error: 'transport_create_failed', detail: msg }, { status: 500 });
  }
}
