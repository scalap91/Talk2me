import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { searchUsers, isFriend, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q') ?? '';
  // Mode browse (?browse=1) : à vide, on liste les comptes récents (« tout s'affiche »).
  if (!q.trim()) {
    if (!request.nextUrl.searchParams.get('browse')) return NextResponse.json({ users: [] });
    const rows = getDb().prepare(
      `SELECT id, talk2me_id, username, display_name FROM users WHERE id != ? AND username IS NOT NULL AND username != '' ORDER BY rowid DESC LIMIT 100`,
    ).all(me.id) as { id: string; talk2me_id: string; username: string; display_name: string | null }[];
    return NextResponse.json({ users: rows.map((u) => ({ ...u, is_friend: isFriend(me.id, u.id) })) });
  }

  const users = searchUsers(q, me.id).map((u) => ({
    id: u.id,
    talk2me_id: u.talk2me_id,
    username: u.username,
    display_name: u.display_name,
    is_friend: isFriend(me.id, u.id),
  }));
  return NextResponse.json({ users });
}
