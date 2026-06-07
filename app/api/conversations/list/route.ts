/**
 * GET /api/conversations/list
 * Liste les conversations du user courant (kind + peer + preview + unread).
 *
 * Phase 3 multi-user temps réel — cf doctrine
 * `talktome-multi-user-temps-reel`.
 *
 * Talk2Me #333 v2 (Pascal 2026-06-04) — On RÉINCLUT les conv kind='agent'
 * (IA solo "T2M de X") dans la liste : "Amis" devient le HUB UNIQUE qui
 * combine IA solo + P2P. Cf doctrine [[talk2me-ia-personnelle-integree]].
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  getOrCreateAgentConversation,
  listUserConversations,
  getPresences,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Garantit que la conv IA solo existe pour ce user (la créer si premier
  // login) afin qu'elle apparaisse en tête du hub /friends.
  getOrCreateAgentConversation(me.id);

  const convs = listUserConversations(me.id);

  // Précharge les présences des "peers" pour affichage dot vert sans round-trip.
  const peerIds = convs.map((c) => c.peer?.id).filter((x): x is string => !!x);
  const presences = getPresences(peerIds);

  const payload = convs.map((c) => ({
    id: c.id,
    kind: c.kind,
    created_at: c.created_at,
    last_message_preview: c.last_message_preview,
    last_message_at: c.last_message_at,
    unread_count: c.unread_count,
    peer: c.peer
      ? {
          id: c.peer.id,
          talk2me_id: c.peer.talk2me_id,
          username: c.peer.username,
          display_name: c.peer.display_name,
          avatar_url: c.peer.avatar_url,
          presence: presences[c.peer.id] || null,
        }
      : null,
  }));

  return NextResponse.json({ conversations: payload });
}
