/** Talk2Me — Supprimer une conversation de SA liste (la masque pour CE user,
 *  sans toucher celle des autres ; réapparaît si un nouveau message arrive).
 *  POST /api/conversations/{id}/hide. (Pascal 2026-06-17) */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hideConversationForUser } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const ok = hideConversationForUser(id, me.id);
  return NextResponse.json({ ok });
}
