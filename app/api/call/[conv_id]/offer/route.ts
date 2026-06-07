/**
 * POST /api/call/[conv_id]/offer
 *
 * Phase 4 — Signaling WebRTC.
 * L'appelant publie son SDP offer sur le canal `conv:{id}` (réutilisé pour
 * les events temps réel de la conversation). Le pair connecté en SSE reçoit
 * l'event `call_offer` et peut ouvrir son CallModal en mode 'incoming'.
 *
 * Body : { kind: 'audio'|'video', sdp_offer: RTCSessionDescriptionInit }
 *
 * Sécurité : participant only ; conv kind doit être 'p2p'.
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

  let body: { kind?: unknown; sdp_offer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const kind = body.kind === 'video' ? 'video' : 'audio';
  const sdp_offer = body.sdp_offer;
  if (!sdp_offer || typeof sdp_offer !== 'object') {
    return NextResponse.json({ error: 'sdp_offer_required' }, { status: 400 });
  }

  publish(`conv:${conv.id}`, {
    kind: 'call_offer',
    data: {
      conversation_id: conv.id,
      from_user_id: me.id,
      from_username: me.username,
      from_display_name: me.display_name,
      kind,
      sdp_offer,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true });
}
