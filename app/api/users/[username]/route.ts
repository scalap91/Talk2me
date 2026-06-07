import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserByUsername, isFriend, countFriends, getPresence } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { username } = await context.params;
  const clean = (username || '').replace(/^@/, '').trim().toLowerCase();
  if (!clean) return NextResponse.json({ error: 'username_required' }, { status: 400 });

  const user = getUserByUsername(clean);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      talk2me_id: user.talk2me_id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      friends_count: countFriends(user.id),
      presence: getPresence(user.id),
    },
    is_self: user.id === me.id,
    is_friend: user.id !== me.id && isFriend(me.id, user.id),
  });
}
