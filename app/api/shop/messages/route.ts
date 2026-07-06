/**
 * GET /api/shop/messages — Conversations COMMERCE (litiges vendeur↔acheteur) du
 * user. SÉPARÉ de Discussions : ces fils n'apparaissent QUE dans le Shop.
 * Pascal 2026-06-27 : « la messagerie Shop sert à régler les litiges, pas à faire
 * connaissance ». Doctrine [[feedback_talk2me_tout_dans_le_chat]].
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listUserConversations } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const convs = listUserConversations(me.id)
    .filter((c) => c.kind === 'commerce')
    .map((c) => ({
      id: c.id,
      peer: c.peer ? { username: c.peer.username, display_name: c.peer.display_name ?? null, avatar_url: c.peer.avatar_url ?? null } : null,
      last_message_preview: c.last_message_preview ?? null,
      last_message_at: c.last_message_at ?? null,
      unread_count: c.unread_count ?? 0,
    }));
  return NextResponse.json({ ok: true, conversations: convs });
}
