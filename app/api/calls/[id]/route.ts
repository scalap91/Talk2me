/**
 * GET /api/calls/[id] — État courant d'un appel (Talk2Me #418).
 *
 * Sécurité : seul caller ou callee peut consulter.
 * Utile pour resync UI après reconnexion SSE / refresh.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById, getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const call = getCallById(id);
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (call.caller_id !== me.id && call.callee_id !== me.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const caller = getUserById(call.caller_id);
  const callee = getUserById(call.callee_id);

  return NextResponse.json({
    ok: true,
    call: {
      id: call.id,
      caller_id: call.caller_id,
      callee_id: call.callee_id,
      conv_id: call.conv_id,
      kind: call.kind,
      state: call.state,
      started_at: call.started_at,
      accepted_at: call.accepted_at,
      ended_at: call.ended_at,
      end_reason: call.end_reason,
      last_ring_beat_at: call.last_ring_beat_at,
    },
    caller: caller && {
      id: caller.id,
      username: caller.username,
      display_name: caller.display_name,
      avatar_url: caller.avatar_url,
    },
    callee: callee && {
      id: callee.id,
      username: callee.username,
      display_name: callee.display_name,
      avatar_url: callee.avatar_url,
    },
  });
}
