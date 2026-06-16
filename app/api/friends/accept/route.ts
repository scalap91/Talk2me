/** POST /api/friends/accept { friend_id } — accepter une demande d'ami reçue. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { acceptFriend, getUserById } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { friend_id?: unknown };
  const friendId = typeof body.friend_id === 'string' ? body.friend_id.trim() : '';
  if (!friendId) return NextResponse.json({ error: 'friend_id_required' }, { status: 400 });

  const ok = acceptFriend(me.id, friendId);
  if (!ok) return NextResponse.json({ error: 'no_pending_request' }, { status: 404 });

  // Prévenir l'initiateur que sa demande a été acceptée.
  void sendPushToUser(friendId, {
    title: `@${me.username} a accepté ta demande`,
    body: 'Vous êtes maintenant amis sur Talk2Me',
    tag: `friendok-${me.id}`,
    url: '/friends',
  }).catch(() => {});

  const friend = getUserById(friendId);
  return NextResponse.json({ ok: true, friend: friend ? { id: friend.id, username: friend.username, display_name: friend.display_name } : null });
}
