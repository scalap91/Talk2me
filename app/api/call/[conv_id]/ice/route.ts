/**
 * POST /api/call/[conv_id]/ice
 *
 * Échange des ICE candidates entre les 2 pairs (trickle ICE).
 *
 * Body : { candidate: RTCIceCandidateInit }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getConversation } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ conv_id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { conv_id } = await ctx.params;
  const conv = getConversation(conv_id, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (conv.kind !== 'p2p') {
    return NextResponse.json({ error: 'call_p2p_only' }, { status: 400 });
  }

  let body: { candidate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const candidate = body.candidate;
  // candidate peut être `null` (end-of-candidates) — on autorise.
  if (typeof candidate === 'undefined') {
    return NextResponse.json({ error: 'candidate_required' }, { status: 400 });
  }

  publish(`conv:${conv.id}`, {
    kind: 'ice_candidate',
    data: {
      conversation_id: conv.id,
      from_user_id: me.id,
      candidate,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true });
}
