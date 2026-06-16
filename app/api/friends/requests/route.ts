/** GET /api/friends/requests — demandes d'ami REÇUES (en attente d'accept/refus). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listIncomingFriendRequests } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const requests = listIncomingFriendRequests(me.id).map((u) => ({
    id: u.id,
    talk2me_id: u.talk2me_id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    requested_at: u.requested_at,
  }));
  return NextResponse.json({ ok: true, requests });
}
