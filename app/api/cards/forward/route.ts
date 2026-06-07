/**
 * POST /api/cards/forward { card_id, to_conv_id, comment? }
 * Talk2Me #331 (Pascal 2026-06-04) — Forward d'une saved card vers une conv
 * P2P existante. Crée un message kind='user' avec le commentaire optionnel +
 * la card snapshot dans le bon champ (youtube/recipe/place/etc.) et broadcast
 * SSE comme un message normal.
 *
 * Doctrine [[talktome-conversation-avant-recherche]] : la card vit dans la
 * conv comme n'importe quel message, l'ami peut y répondre.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  appendMessage,
  getConversation,
  getSavedCardById,
  type DbYoutube,
  type DbPlace,
  type DbRecipe,
  type DbProduct,
  type DbWikipedia,
  type DbWeather,
  type DbWebSearch,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { card_id?: unknown; to_conv_id?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const cardId = typeof body.card_id === 'string' ? body.card_id.trim() : '';
  const toConvId = typeof body.to_conv_id === 'string' ? body.to_conv_id.trim() : '';
  const commentRaw = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (!cardId) return NextResponse.json({ error: 'card_id_required' }, { status: 400 });
  if (!toConvId) return NextResponse.json({ error: 'to_conv_id_required' }, { status: 400 });
  const comment = commentRaw.slice(0, 1000);

  const card = getSavedCardById(me.id, cardId);
  if (!card) return NextResponse.json({ error: 'card_not_found' }, { status: 404 });

  const conv = getConversation(toConvId, me.id);
  if (!conv) return NextResponse.json({ error: 'conv_not_found' }, { status: 404 });
  if (conv.kind === 'agent') {
    return NextResponse.json({ error: 'cannot_forward_to_agent_conv' }, { status: 400 });
  }

  // Snapshot card into the right column
  let youtube: DbYoutube | null | undefined;
  let places: DbPlace[] | null | undefined;
  let recipe: DbRecipe | null | undefined;
  let products: DbProduct[] | null | undefined;
  let wikipedia: DbWikipedia | null | undefined;
  let weather: DbWeather | null | undefined;
  let webSearch: DbWebSearch | null | undefined;

  switch (card.card_kind) {
    case 'youtube':
      youtube = card.card_data as DbYoutube;
      break;
    case 'place':
      // card_data stored as { places, intent_query, ... } OR a single PlaceCard shape
      if (Array.isArray(card.card_data)) {
        places = card.card_data as DbPlace[];
      } else if (
        card.card_data &&
        typeof card.card_data === 'object' &&
        Array.isArray((card.card_data as Record<string, unknown>).places)
      ) {
        places = (card.card_data as Record<string, unknown>).places as DbPlace[];
      }
      break;
    case 'recipe':
      recipe = card.card_data as DbRecipe;
      break;
    case 'product':
      products = Array.isArray(card.card_data)
        ? (card.card_data as DbProduct[])
        : [card.card_data as DbProduct];
      break;
    case 'wikipedia':
      wikipedia = card.card_data as DbWikipedia;
      break;
    case 'weather':
      weather = card.card_data as DbWeather;
      break;
    case 'web_search':
      webSearch = card.card_data as DbWebSearch;
      break;
    default:
      // video_card / image_card / texte_card not yet supported in forward
      return NextResponse.json({ error: 'unsupported_card_kind' }, { status: 400 });
  }

  const text = comment || '';
  const message = appendMessage(
    conv.id,
    'user',
    text,
    [],
    youtube,
    places,
    undefined,
    recipe,
    products,
    wikipedia,
    weather,
    webSearch,
    undefined, // tiktok (pas de forward TikTok pour le moment)
    {
      kind: 'user',
      senderId: me.id,
      quotedMessageId: null,
    }
  );

  publish(`conv:${conv.id}`, {
    kind: 'chat',
    data: {
      id: message.id,
      conversation_id: conv.id,
      sender_id: me.id,
      sender_username: me.username,
      sender_display_name: me.display_name,
      text: message.text,
      created_at: message.created_at,
      quoted_message_id: null,
      kind: 'user',
      youtube: youtube ?? null,
      places: places ?? null,
      recipe: recipe ?? null,
      products: products ?? null,
      wikipedia: wikipedia ?? null,
      weather: weather ?? null,
      web_search: webSearch ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      conversation_id: conv.id,
      sender_id: me.id,
      text: message.text,
      timestamp: message.created_at,
    },
  });
}
