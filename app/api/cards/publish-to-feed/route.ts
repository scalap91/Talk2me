/**
 * POST /api/cards/publish-to-feed — Pascal 2026-07-01.
 * Ferme la boucle "Conversation → Cards" : une card produite par l'IA dans le chat
 * est PUBLIÉE dans le feed. On la convertit en `.card` unique (adaptateurs fromChat*)
 * puis on crée un post feed (direct_card) qui porte ce `.card` → il s'affiche via le
 * moteur (readFeedCard/SuperCardView), comme n'importe quelle card.
 *
 * Body : { card_kind, card_data }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createDirectCard, setCardDotcard } from '@/lib/db-direct-cards';
import { serializeCard, type SuperCard } from '@/lib/cards/supercard';
import { saveToMoteur } from '@/lib/cards/moteur-sync';
import {
  fromChatYouTube, fromChatPlace, fromChatRecipe, fromChatWikipedia,
  fromChatWeather, fromChatProduct, fromChatWebResult,
} from '@/lib/cards/adapt-chat';
import type { YouTubeCardData, PlaceCardData, RecipeCardData, ProductCardData, WebSearchResultData } from '@/lib/chat-types';
import type { WeatherCardData } from '@/lib/weather';
import type { WikipediaCardData } from '@/lib/wikipedia-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toSuperCard(kind: string, data: unknown): SuperCard | null {
  switch (kind) {
    case 'youtube': return fromChatYouTube(data as YouTubeCardData);
    case 'place': return fromChatPlace(data as PlaceCardData);
    case 'recipe': return fromChatRecipe(data as RecipeCardData);
    case 'wikipedia': return fromChatWikipedia(data as WikipediaCardData);
    case 'weather': return fromChatWeather(data as WeatherCardData);
    case 'product': return fromChatProduct(data as ProductCardData);
    case 'web_search': return fromChatWebResult(data as WebSearchResultData);
    default: return null; // video_card/image_card/texte_card sont déjà des posts feed
  }
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { card_kind?: unknown; card_data?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const kind = typeof body.card_kind === 'string' ? body.card_kind : '';
  if (body.card_data == null) return NextResponse.json({ error: 'card_data_required' }, { status: 400 });

  let card: SuperCard | null;
  try { card = toSuperCard(kind, body.card_data); }
  catch { return NextResponse.json({ error: 'adapt_failed' }, { status: 400 }); }
  if (!card) return NextResponse.json({ error: 'kind_not_publishable' }, { status: 400 });

  try {
    // Post feed générique : le rendu suit le `.card` (readFeedCard → SuperCardView).
    const dc = createDirectCard(me.id, {
      type: 'image',
      media_url: card.images?.[0] ?? null,
      caption: card.title ?? null,
      text: card.text?.body ?? null,
      category: card.categories?.[0] ?? null,
    });
    setCardDotcard(dc.id, serializeCard(card));
    // Card OS Strangler — dual-write : le SuperCard riche (keyé sur l'id du post) → moteur.
    await saveToMoteur({ ...card, id: dc.id, owner: me.id });
    return NextResponse.json({ ok: true, id: dc.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'publish_failed' }, { status: 400 });
  }
}
