import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBusinessInboxByKey, guestOwnsConversation, getMessagesAfter } from '@/lib/biz-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ key: string }> }

// Public (widget visiteur) — récupère les nouveaux messages (réponses du
// propriétaire ou de son IA) après un timestamp.
export async function GET(req: NextRequest, ctx: Params) {
  const { key } = await ctx.params;
  const inbox = getBusinessInboxByKey(key);
  if (!inbox) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  const convId = url.searchParams.get('c') || '';
  const after = parseInt(url.searchParams.get('after') || '0', 10) || 0;

  const guest = guestOwnsConversation(inbox.id, token, convId);
  if (!guest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const messages = getMessagesAfter(convId, after).map((m) => ({
    id: m.id,
    from: m.sender_id === guest.user_id ? 'me' : (m.kind === 'ai_reply' || m.role === 'agent' ? 'agent' : 'support'),
    text: m.text || '',
    at: m.created_at,
  }));

  return NextResponse.json({ ok: true, messages, now: Date.now() });
}
