/**
 * POST /api/calls/[id]/hangup — Raccrochage (Talk2Me #418).
 *
 * Anti-spoof : seul caller_id ou callee_id peut raccrocher.
 * Body optionnel: { reason?: 'no_answer'|'network_error'|... }
 * Broadcast 'call:hangup' à l'AUTRE participant pour qu'il ferme son UI.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById, hangupCall, type CallEndReason } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_REASONS: CallEndReason[] = [
  'caller_hangup',
  'callee_hangup',
  'declined',
  'no_answer',
  'busy',
  'network_error',
];

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const call = getCallById(id);
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (call.caller_id !== me.id && call.callee_id !== me.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let reason: CallEndReason | undefined;
  try {
    const body: { reason?: unknown } = await request.json();
    if (typeof body.reason === 'string' && VALID_REASONS.includes(body.reason as CallEndReason)) {
      reason = body.reason as CallEndReason;
    }
  } catch {
    // body optionnel
  }

  const result = hangupCall(id, me.id, reason);
  // Toujours broadcast (idempotent : si déjà ended, on notifie quand même
  // l'autre peer pour son UI au cas où il avait raté l'event précédent).
  const otherId = me.id === call.caller_id ? call.callee_id : call.caller_id;
  publish(`user:${otherId}`, {
    kind: 'call:hangup',
    data: {
      call_id: id,
      at: Date.now(),
      end_reason: result.call?.end_reason ?? reason ?? null,
    },
  });
  // Notifie aussi le raccrocheur (pour cleanup UI sur autres onglets).
  publish(`user:${me.id}`, {
    kind: 'call:hangup',
    data: {
      call_id: id,
      at: Date.now(),
      end_reason: result.call?.end_reason ?? reason ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    call_id: id,
    end_reason: result.call?.end_reason ?? null,
  });
}
