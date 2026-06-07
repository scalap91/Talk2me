/**
 * POST /api/call/[conv_id]/end
 *
 * Fin d'appel : peut être un decline (incoming refusé) ou un hangup
 * (call actif terminé).
 *
 * Body : { type: 'decline'|'hangup', reason?: string }
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

  let body: { type?: unknown; reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // body optionnel
  }

  const type = body.type === 'decline' ? 'decline' : 'hangup';
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined;

  publish(`conv:${conv.id}`, {
    kind: type === 'decline' ? 'call_decline' : 'call_hangup',
    data: {
      conversation_id: conv.id,
      from_user_id: me.id,
      reason,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true });
}
