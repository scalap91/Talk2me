/** Talk2Me — Épingler / désépingler une conversation POUR CE user (WhatsApp-like).
 *  N'affecte QUE ma vue (conversation_participants), jamais celle de l'autre.
 *  POST /api/conversations/{id}/pin  body { on: boolean }. (Lot 1) */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setConversationPinned } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const on = body?.on !== false; // défaut = épingler
  const ok = setConversationPinned(id, me.id, on);
  if (!ok) return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  return NextResponse.json({ ok, pinned: on });
}
