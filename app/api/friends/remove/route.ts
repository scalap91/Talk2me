import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { removeFriend } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { friend_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const friendId = typeof body.friend_id === 'string' ? body.friend_id.trim() : '';
  if (!friendId) return NextResponse.json({ error: 'friend_id_required' }, { status: 400 });

  const removed = removeFriend(me.id, friendId);
  return NextResponse.json({ ok: true, removed });
}
