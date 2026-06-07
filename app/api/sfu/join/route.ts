/**
 * POST /api/sfu/join
 *
 * Talk2Me #403 — Le client demande à rejoindre la Room SFU d'une activity.
 * Réponse : { routerRtpCapabilities, peerId, existingProducers }
 *
 * - routerRtpCapabilities : à passer à device.load() côté client.
 * - existingProducers : liste des producers déjà actifs dans la room
 *   (autres participants) pour que le client puisse les consume direct.
 *
 * Notifie aussi le canal SSE conv:{convId} pour que les autres clients
 * sachent qu'un nouveau peer est arrivé.
 *
 * Body : { activity_id: string }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getOrCreateRoom, getOrCreatePeer, listRemoteProducers } from '@/lib/sfu/rooms';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { activity_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const activityId = typeof body.activity_id === 'string' ? body.activity_id : '';

  const auth = authForActivity(request, activityId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { me, convId } = auth.ctx;

  try {
    const room = await getOrCreateRoom(auth.ctx.activityId);
    getOrCreatePeer(room, me.id);
    const existingProducers = listRemoteProducers(room, me.id);

    publish(`conv:${convId}`, {
      kind: 'activity_state',
      data: {
        activity_id: auth.ctx.activityId,
        state: null,
        sfu_peer_joined: {
          user_id: me.id,
          username: me.username,
          display_name: me.display_name,
          sent_at: Date.now(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      routerRtpCapabilities: room.router.rtpCapabilities,
      peerId: me.id,
      existingProducers,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sfu] join failed', msg);
    return NextResponse.json(
      { error: 'sfu_unavailable', detail: msg },
      { status: 503 }
    );
  }
}
