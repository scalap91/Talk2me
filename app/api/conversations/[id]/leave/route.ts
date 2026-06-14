/** Talk2Me — Quitter un GROUPE (soi-même). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { leaveGroup } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const r = leaveGroup(id, me.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
