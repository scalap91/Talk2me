/** Talk2Me — Membres d'un GROUPE. POST {member_ids} ajoute · DELETE {user_id} retire. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addGroupMembers, removeGroupMember } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { member_ids?: string[] };
  const r = addGroupMembers(id, me.id, Array.isArray(b.member_ids) ? b.member_ids : []);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, added: r.added });
}

export async function DELETE(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { user_id?: string };
  if (!b.user_id) return NextResponse.json({ error: 'no_user' }, { status: 400 });
  const r = removeGroupMember(id, me.id, b.user_id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
