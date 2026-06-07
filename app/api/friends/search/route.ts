import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { searchUsers, isFriend } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ users: [] });

  const users = searchUsers(q, me.id).map((u) => ({
    id: u.id,
    talk2me_id: u.talk2me_id,
    username: u.username,
    display_name: u.display_name,
    is_friend: isFriend(me.id, u.id),
  }));
  return NextResponse.json({ users });
}
