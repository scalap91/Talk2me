/**
 * POST /api/sfu/consume
 *
 * Body : { activity_id, transport_id, producer_id, rtpCapabilities }
 * Réponse : { consumer: { id, producerId, kind, rtpParameters } }
 *
 * Le consumer est créé en mode paused — le client doit appeler
 * /api/sfu/consume/resume une fois qu'il a attach l'élément <audio>/<video>
 * pour démarrer le RTP (évite de perdre des paquets au début).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { RtpCapabilities } from 'mediasoup/types';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, getOrCreatePeer, consume } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: {
    activity_id?: unknown;
    transport_id?: unknown;
    producer_id?: unknown;
    rtpCapabilities?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';
  const transportId = typeof body.transport_id === 'string' ? body.transport_id : '';
  const producerId = typeof body.producer_id === 'string' ? body.producer_id : '';
  const rtpCaps = body.rtpCapabilities;
  if (!transportId || !producerId || !rtpCaps || typeof rtpCaps !== 'object') {
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
    const consumer = await consume(
      room,
      peer,
      transportId,
      producerId,
      rtpCaps as RtpCapabilities
    );
    return NextResponse.json({ ok: true, consumer });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] consume failed', msg);
    return NextResponse.json({ error: 'consume_failed', detail: msg }, { status: 500 });
  }
}
