import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listFriends, getPresences } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rawFriends = listFriends(me.id);
  const presences = getPresences(rawFriends.map((u) => u.id));
  const friends = rawFriends.map((u) => ({
    id: u.id,
    talk2me_id: u.talk2me_id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    presence: presences[u.id] || null,
  }));
  return NextResponse.json({ friends });
}
