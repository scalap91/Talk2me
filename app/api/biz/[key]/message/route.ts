import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { appendMessage } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { getBusinessInboxByKey, guestOwnsConversation } from '@/lib/biz-inbox';
import { runBizAiReply } from '@/lib/biz-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ key: string }> }

// Public (widget visiteur) — le visiteur poste un message → tombe dans la
// conversation T2M du propriétaire (qui le voit en temps réel via SSE).
export async function POST(req: NextRequest, ctx: Params) {
  const { key } = await ctx.params;
  const inbox = getBusinessInboxByKey(key);
  if (!inbox) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: { visitor_token?: string; conversation_id?: string; text?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const token = body.visitor_token || '';
  const convId = body.conversation_id || '';
  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'too_long' }, { status: 400 });

  const guest = guestOwnsConversation(inbox.id, token, convId);
  if (!guest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const msg = appendMessage(
    convId, 'user', text, [],
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    { kind: 'user', senderId: guest.user_id }
  );

  // Temps réel vers la messagerie du propriétaire (même format que le chat T2M).
  publish(`conv:${convId}`, {
    kind: 'chat',
    data: {
      id: msg.id,
      conversation_id: convId,
      sender_id: guest.user_id,
      text: msg.text,
      created_at: msg.created_at,
      kind: 'user',
      media: null,
    },
  });

  // Réponse auto de l'IA si activée (ancrée sur la base documentaire).
  if (inbox.bot_enabled) {
    void runBizAiReply(inbox, convId, guest.user_id);
  }

  return NextResponse.json({ ok: true, id: msg.id, at: msg.created_at });
}
