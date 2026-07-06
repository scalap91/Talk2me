/** Talk2Me — Mettre en sourdine / réactiver une conversation POUR CE user
 *  (WhatsApp-like). N'affecte QUE ma vue (conversation_participants).
 *  POST /api/conversations/{id}/mute  body { on: boolean }
 *    on=true  → muet ~100 ans, on=false → réactive (NULL). (Lot 1) */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setConversationMuted } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

const HUNDRED_YEARS_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const on = body?.on !== false; // défaut = muet
  const until = on ? Date.now() + HUNDRED_YEARS_MS : null;
  const ok = setConversationMuted(id, me.id, until);
  if (!ok) return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  return NextResponse.json({ ok, muted: on });
}
