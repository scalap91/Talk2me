/**
 * GET /api/conversations/[id]
 * Détails de la conversation + messages (paginés, derniers N).
 * Marque la conv comme lue par le user (last_read_at).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  getConversation,
  getConversationMessages,
  getPresence,
  markConversationRead,
  isFriend,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const conv = getConversation(id, me.id);
  if (!conv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const peer = conv.kind === 'p2p'
    ? conv.participants.find((p) => p.id !== me.id) || null
    : null;
  const peerPresence = peer ? getPresence(peer.id) : null;
  // Appel réservé aux VRAIES conversations entre AMIS (Pascal 2026-06-26). Une conversation
  // vendeur↔acheteur (transaction) = TEXTE uniquement, avant ET après paiement (l'appel
  // ne sert à rien, le message suffit + anti-désintermédiation [[feedback_anti_desintermediation]]).
  const callsUnlocked = peer ? isFriend(me.id, peer.id) : false;

  const dbMessages = getConversationMessages(conv.id);
  // Talk2Me #324 — enrichit chaque message avec sender_id, quoted_message_id,
  // kind ('user'|'ai_reply'), ai_for_user_id, ai_name pour permettre au front
  // d'afficher la bulle IA indentée + le mini-quote du message cité.
  // sender_id = pour les messages de type 'user' on l'extrait du JOIN suivant
  // (les messages anciens n'ont pas de sender_id explicite mais on a un mapping
  // role → owner via la table conversations.user_id).
  const messages = dbMessages.map((msg) => {
    // Pour ai_reply : "sender" = l'owner de l'IA (visible côté UI mais bulle IA).
    // Pour user : on n'a pas de sender_id stocké au DB level dans le schéma
    // existant (legacy : role 'user' = créateur de la conv côté agent ;
    // côté p2p le sender_id est broadcasté en SSE). Pour le rendu initial
    // on déduit grâce au realtime-bus.publish précédent ; pour la liste
    // initiale on remonte tel quel et le front fallback sur role.
    return {
      id: msg.id,
      role: msg.role,
      content: msg.text,
      enc: msg.enc ?? 0, // E2EE : 1 → content chiffré, le client déchiffre
      links: msg.links,
      youtube: msg.youtube,
      places: msg.places ?? undefined,
      requires_geoloc: msg.requires_geoloc === true,
      recipe: msg.recipe ?? undefined,
      products: msg.products ?? undefined,
      wikipedia: msg.wikipedia ?? undefined,
      weather: msg.weather ?? undefined,
      web_search: msg.web_search ?? undefined,
      tiktok: msg.tiktok ?? undefined,
      intent_query: msg.intent_query ?? undefined,
      intent_label_fr: msg.intent_label_fr ?? undefined,
      user_lat: typeof msg.user_lat === 'number' ? msg.user_lat : undefined,
      user_lng: typeof msg.user_lng === 'number' ? msg.user_lng : undefined,
      timestamp: msg.created_at,
      // Talk2Me #324
      sender_id: msg.sender_id ?? null,
      quoted_message_id: msg.quoted_message_id ?? null,
      kind: msg.kind || 'user',
      ai_for_user_id: msg.ai_for_user_id ?? null,
      ai_name: msg.ai_name ?? null,
      ai_avatar_url: msg.ai_avatar_url ?? null,
      // Talk2Me média chat (Pascal 2026-06-04)
      media: msg.media ?? null,
      // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — array de
      // UnifiedCard pour rendu sous bulle. Bug fix verbatim Pascal :
      // "il ne sait pas me ressevir en card dorigine le contenue quil a citer".
      attached_cards: msg.attached_cards ?? null,
    };
  });

  markConversationRead(conv.id, me.id);

  return NextResponse.json({
    conversation: {
      id: conv.id,
      kind: conv.kind,
      name: conv.name ?? null,
      created_at: conv.created_at,
      created_by: conv.created_by,
      participants: conv.participants.map((p) => ({
        id: p.id,
        talk2me_id: p.talk2me_id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      })),
      peer: peer
        ? {
            id: peer.id,
            talk2me_id: peer.talk2me_id,
            username: peer.username,
            display_name: peer.display_name,
            avatar_url: peer.avatar_url,
            presence: peerPresence,
          }
        : null,
      calls_unlocked: callsUnlocked,
    },
    messages,
  });
}
