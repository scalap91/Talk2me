/**
 * POST /api/calls/[id]/webrtc — Relai SDP/ICE pour Calls v2 (Talk2Me #418).
 *
 * Une fois l'appel accepté, l'appelant et l'appelé négocient leur connexion
 * WebRTC P2P direct (doctrine [[talk2me-calls-architecture]] : P2P pour
 * 1-to-1). Ce endpoint relaye les payloads de signaling sur le canal
 * user:{otherId}.
 *
 * Body: { type: 'offer'|'answer'|'ice'|'end_of_candidates', payload: any }
 *
 * Anti-spoof : seul caller ou callee peut publier.
 * Refusé si state != 'accepted'.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_TYPES = new Set(['offer', 'answer', 'ice', 'end_of_candidates']);

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const call = getCallById(id);
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (call.caller_id !== me.id && call.callee_id !== me.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (call.state !== 'accepted') {
    return NextResponse.json({ error: 'invalid_state', state: call.state }, { status: 409 });
  }

  let body: { type?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const type = typeof body.type === 'string' ? body.type : '';
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }

  const otherId = me.id === call.caller_id ? call.callee_id : call.caller_id;
  publish(`user:${otherId}`, {
    kind: 'call:webrtc',
    data: {
      call_id: id,
      from_user_id: me.id,
      type,
      payload: body.payload ?? null,
      at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true });
}
