/** Talk2Me — Archiver / désarchiver une conversation POUR CE user (WhatsApp-like).
 *  N'affecte QUE ma vue (conversation_participants), jamais celle de l'autre.
 *  POST /api/conversations/{id}/archive  body { on: boolean }. (Lot 1) */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setConversationArchived } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const on = body?.on !== false; // défaut = archiver
  const ok = setConversationArchived(id, me.id, on);
  if (!ok) return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  return NextResponse.json({ ok, archived: on });
}
