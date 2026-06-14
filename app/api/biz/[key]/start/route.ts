import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { getBusinessInboxByKey, getOrStartGuestConversation, getMessagesAfter } from '@/lib/biz-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ key: string }> }

// Public (widget visiteur) — démarre/retrouve la conversation du visiteur.
export async function POST(req: NextRequest, ctx: Params) {
  const { key } = await ctx.params;
  const inbox = getBusinessInboxByKey(key);
  if (!inbox) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: { visitor_token?: string; name?: string } = {};
  try { body = await req.json(); } catch { /* vide ok */ }
  const token = (body.visitor_token && /^[a-f0-9]{16,40}$/.test(body.visitor_token))
    ? body.visitor_token
    : randomBytes(12).toString('hex');

  const guest = getOrStartGuestConversation(inbox, token, body.name || null);
  const history = getMessagesAfter(guest.conversation_id, 0).map((m) => ({
    id: m.id,
    from: m.sender_id === guest.user_id ? 'me' : (m.kind === 'ai_reply' || m.role === 'agent' ? 'agent' : 'support'),
    text: m.text || '',
    at: m.created_at,
  }));

  return NextResponse.json({
    ok: true,
    visitor_token: token,
    conversation_id: guest.conversation_id,
    name: inbox.name,
    greeting: inbox.greeting,
    accent: inbox.accent || '#dc2626',
    history,
    now: Date.now(),
  });
}
