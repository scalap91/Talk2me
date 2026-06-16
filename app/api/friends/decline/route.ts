/** POST /api/friends/decline { friend_id } — refuser une demande d'ami reçue. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { declineFriend } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { friend_id?: unknown };
  const friendId = typeof body.friend_id === 'string' ? body.friend_id.trim() : '';
  if (!friendId) return NextResponse.json({ error: 'friend_id_required' }, { status: 400 });
  const ok = declineFriend(me.id, friendId);
  return NextResponse.json({ ok });
}
