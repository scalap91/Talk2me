/**
 * /api/moderation/block — Bloquer / débloquer un utilisateur (Apple Guideline 1.2).
 * Body : { user_id, action?: 'block' | 'unblock' } (défaut 'block').
 * Placé hors de /api/users/[username] pour éviter le conflit de slug Next.js.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { blockUser, unblockUser } from '@/lib/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!userId || userId === me.id) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  if (body.action === 'unblock') {
    unblockUser(me.id, userId);
    return NextResponse.json({ ok: true, blocked: false });
  }
  blockUser(me.id, userId);
  return NextResponse.json({ ok: true, blocked: true });
}
