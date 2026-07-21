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
import { getGuestConversationIds } from '@/lib/biz-inbox';
import { getRencontreProfile } from '@/lib/simple-shop';

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

  // Talk2Me — les fils VISITEUR d'une messagerie entreprise ne polluent PAS la
  // liste principale : ils vivent DANS la messagerie entreprise (1 ligne, clients
  // dedans). On les exclut ici. Cf [[feedback_talk2me_tout_dans_le_chat]].
  const guestConvIds = getGuestConversationIds(me.id);
  const convs = listUserConversations(me.id).filter(
    (c) => !guestConvIds.has(c.id) && !(c.peer?.username || '').startsWith('guest-')
      // Messagerie SHOP (litiges vendeur/acheteur) = à part, jamais dans Discussions.
      && c.kind !== 'commerce'
  );

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
    // Prefs PAR-USER (WhatsApp-like) — depuis conversation_participants du user courant.
    pinned: c.pinned,
    archived: c.archived,
    muted: c.muted,
    peer: c.peer
      ? (() => {
          // Rencontre : peer avec un profil → on affiche son PSEUDO + photo de profil (jamais le vrai nom).
          let name = c.peer.display_name; let avatar = c.peer.avatar_url;
          try { const prof = getRencontreProfile(c.peer.id); if (prof) { name = prof.name; if (prof.cover_url) avatar = prof.cover_url; } } catch { /* */ }
          return {
            id: c.peer.id,
            talk2me_id: c.peer.talk2me_id,
            username: c.peer.username,
            display_name: name,
            avatar_url: avatar,
            presence: presences[c.peer.id] || null,
          };
        })()
      : null,
  }));

  return NextResponse.json({ conversations: payload });
}
