/**
 * POST /api/calls/[id]/decline — Refus par l'appelé (Talk2Me #418).
 *
 * Anti-spoof : seul callee_id peut refuser.
 * Broadcast 'call:busy' à l'appelant → boucle son occupé + auto-hangup ~8s.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById, declineCall } from '@/lib/db';
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
  if (call.state !== 'ringing') {
    return NextResponse.json({ error: 'invalid_state', state: call.state }, { status: 409 });
  }

  const ok = declineCall(id);
  if (!ok) {
    return NextResponse.json({ error: 'race_decline_failed' }, { status: 409 });
  }

  publish(`user:${call.caller_id}`, {
    kind: 'call:busy',
    data: { call_id: id, at: Date.now() },
  });

  return NextResponse.json({ ok: true, call_id: id });
}
