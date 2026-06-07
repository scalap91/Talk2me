/**
 * POST /api/sfu/produce
 *
 * Body : { activity_id, transport_id, kind: 'audio'|'video', rtpParameters }
 * Réponse : { producer_id }
 *
 * Notifie le canal SSE de la conv pour que les autres peers consume ce
 * nouveau producer.
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : on rejette tout kind
 * autre que 'audio'/'video'. Pas de data channel pour vidéo partenaire ;
 * le SFU ne sert QUE pour audio+cam des participants.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { RtpParameters, MediaKind } from 'mediasoup/types';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, getOrCreatePeer, produce } from '@/lib/sfu/rooms';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { activity_id?: unknown; transport_id?: unknown; kind?: unknown; rtpParameters?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';
  const transportId = typeof body.transport_id === 'string' ? body.transport_id : '';
  const kindStr = body.kind;
  const rtpParameters = body.rtpParameters;
  if (kindStr !== 'audio' && kindStr !== 'video') {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const kind: MediaKind = kindStr;
  if (!transportId || !rtpParameters || typeof rtpParameters !== 'object') {
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
    const producer = await produce(
      room,
      peer,
      transportId,
      kind,
      rtpParameters as RtpParameters
    );
    publish(`conv:${auth.ctx.convId}`, {
      kind: 'activity_state',
      data: {
        activity_id: auth.ctx.activityId,
        state: null,
        sfu_new_producer: {
          producer_id: producer.id,
          user_id: auth.ctx.me.id,
          kind,
          sent_at: Date.now(),
        },
      },
    });
    return NextResponse.json({ ok: true, producer_id: producer.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] produce failed', msg);
    return NextResponse.json({ error: 'produce_failed', detail: msg }, { status: 500 });
  }
}
