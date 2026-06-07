/**
 * POST /api/calls/[id]/accept — Acceptation par l'appelé (Talk2Me #418).
 *
 * Anti-spoof : seul callee_id peut accepter. Idempotent.
 * Broadcast 'call:accepted' à l'appelant pour basculer sur le média.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById, acceptCall } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const call = getCallById(id);
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (call.callee_id !== me.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (call.state === 'accepted') {
    // Idempotent
    return NextResponse.json({ ok: true, call_id: id, already: true });
  }
  if (call.state !== 'ringing') {
    return NextResponse.json({ error: 'invalid_state', state: call.state }, { status: 409 });
  }

  const ok = acceptCall(id);
  if (!ok) {
    // race possible : un autre client a accepté entre temps
    return NextResponse.json({ error: 'race_accept_failed' }, { status: 409 });
  }

  // Broadcast aux 2 parties : appelant doit basculer son UI, appelé garde le sien.
  publish(`user:${call.caller_id}`, {
    kind: 'call:accepted',
    data: { call_id: id, at: Date.now() },
  });
  publish(`user:${call.callee_id}`, {
    kind: 'call:accepted',
    data: { call_id: id, at: Date.now() },
  });

  return NextResponse.json({ ok: true, call_id: id });
}
