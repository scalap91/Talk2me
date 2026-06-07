/**
 * POST /api/sfu/transport/connect
 *
 * Body : { activity_id, transport_id, dtlsParameters }
 * Le client envoie ça après que mediasoup-client ait émis 'connect' sur
 * son transport (handshake DTLS).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { DtlsParameters } from 'mediasoup/types';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, getOrCreatePeer, connectTransport } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { activity_id?: unknown; transport_id?: unknown; dtlsParameters?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';
  const transportId = typeof body.transport_id === 'string' ? body.transport_id : '';
  const dtls = body.dtlsParameters;
  if (!transportId || !dtls || typeof dtls !== 'object') {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const auth = authForActivity(request, activityId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const room = getRoom(auth.ctx.activityId);
  if (!room) return NextResponse.json({ error: 'room_not_joined' }, { status: 400 });
  const peer = getOrCreatePeer(room, auth.ctx.me.id);

  try {
    await connectTransport(peer, transportId, dtls as DtlsParameters);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] transport/connect failed', msg);
    return NextResponse.json({ error: 'transport_connect_failed', detail: msg }, { status: 500 });
  }
}
