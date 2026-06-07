/**
 * POST /api/sfu/leave
 *
 * Body : { activity_id }
 * Le client annonce qu'il quitte la Room (page unload, hangup, etc.).
 * Cleanup tous ses transports + retire son peer. Si plus personne dans
 * la room → closeRoom auto.
 *
 * Notifie le canal SSE pour que les autres retirent ses vidéos/audios.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { removePeer } from '@/lib/sfu/rooms';
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
  removePeer(auth.ctx.activityId, auth.ctx.me.id);

  publish(`conv:${auth.ctx.convId}`, {
    kind: 'activity_state',
    data: {
      activity_id: auth.ctx.activityId,
      state: null,
      sfu_peer_left: {
        user_id: auth.ctx.me.id,
        sent_at: Date.now(),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
