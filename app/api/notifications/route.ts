/**
 * Talk2Me — Notifications in-app (Pascal 2026-07-28). GET → mes notifs + non-lues. POST {action:'read'} → tout lu.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listNotifs, unreadCount, markAllRead } from '@/lib/notifs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, notifications: listNotifs(me.id), unread: unreadCount(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  markAllRead(me.id);
  return NextResponse.json({ ok: true });
}
