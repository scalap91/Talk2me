/**
 * POST /api/conversations/[id]/unread
 * Marque la conversation comme NON-lue par l'user courant (Lot 2, WhatsApp-like).
 * Recule last_read_at juste avant le dernier message user → unread_count ≥ 1.
 * PAR-USER : n'affecte QUE la vue de ce user (pas de broadcast au peer).
 * Clone de read/route.ts (auth + participant + appel DB).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getConversation, markConversationUnread } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const conv = getConversation(id, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  markConversationUnread(id, me.id);
  return NextResponse.json({ ok: true });
}
