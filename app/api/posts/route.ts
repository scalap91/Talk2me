// /home/ubuntu/talktome/app/api/posts/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getOrCreateUserConversation,
  createPost,
  getPosts,
  getConversationMessages,
  getMixedFeed,
  getLikedCardIds,
  listFriends,
} from '@/lib/db';
import type {
  DbPostWithMessagesAndAuthor,
  DbMessage,
  DbDirectCardWithAuthor,
  PostAuthor,
} from '@/lib/db';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  WebSearchData,
  ProductCardData,
} from '@/lib/chat-types';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { countSlides } from '@/lib/posts/slides';

// Garde-fou : même SOURCE UNIQUE de découpage que le rendu (PostCard) et le
// composer (SelectionFAB) → le nombre annoncé == le nombre rendu.
const MAX_SLIDES = 6;
function estimateSlideCount(msgs: DbMessage[]): number {
  return countSlides(msgs as unknown as Parameters<typeof countSlides>[0]);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostResponseMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  links: string[];
  timestamp: number;
  youtube?: YouTubeCardData | null;
  places?: PlaceCardData[] | null;
  recipe?: RecipeCardData | null;
  requires_geoloc?: boolean;
  intent_query?: string | null;
  intent_label_fr?: string | null;
  user_lat?: number | null;
  user_lng?: number | null;
  web_search?: WebSearchData | null;
  products?: ProductCardData[] | null;
  ai_name?: string | null;
  ai_avatar_url?: string | null;
}

interface PostResponse {
  id: string;
  createdAt: number;
  likes: number;
  views: number;
  messages: PostResponseMessage[];
  /** Talk2Me #378 — auteur public du post pour le header /home (display_name + avatar). */
  author: PostAuthor | null;
}

function toPostResponse(post: DbPostWithMessagesAndAuthor): PostResponse {
  return {
    id: post.id,
    createdAt: post.created_at,
    likes: post.likes,
    views: post.views,
    author: post.author ?? null,
    messages: post.messages.map((msg) => {
      const message: PostResponseMessage = {
        id: msg.id,
        role: msg.role,
        content: msg.text,
        links: msg.links,
        timestamp: msg.created_at,
        ai_name: msg.ai_name ?? null,
        ai_avatar_url: msg.ai_avatar_url ?? null,
      };
      if (msg.youtube !== undefined) {
        message.youtube = msg.youtube as YouTubeCardData | null;
      }
      if (msg.places !== undefined) {
        message.places = msg.places as PlaceCardData[] | null;
      }
      if (msg.recipe !== undefined) {
        message.recipe = msg.recipe as RecipeCardData | null;
      }
      if (msg.requires_geoloc !== undefined) {
        message.requires_geoloc = msg.requires_geoloc;
      }
      if (msg.intent_query !== undefined) {
        message.intent_query = msg.intent_query;
      }
      if (msg.intent_label_fr !== undefined) {
        message.intent_label_fr = msg.intent_label_fr;
      }
      if (msg.user_lat !== undefined) {
        message.user_lat = msg.user_lat;
      }
      if (msg.user_lng !== undefined) {
        message.user_lng = msg.user_lng;
      }
      if (msg.web_search !== undefined) {
        message.web_search = msg.web_search as WebSearchData | null;
      }
      if (msg.products !== undefined) {
        message.products = msg.products as ProductCardData[] | null;
      }
      return message;
    }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageIds } = body as { messageIds?: unknown };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    // Ensure all are strings
    const ids: string[] = messageIds.filter((x): x is string => typeof x === 'string');
    if (ids.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    const conv = getOrCreateUserConversation(user.id);

    // Validation max slides côté serveur (backup du check front).
    // Charge les messages de la conv et filtre dans l'ordre demandé.
    const allMsgs = getConversationMessages(conv.id);
    const byId = new Map<string, DbMessage>();
    for (const m of allMsgs) byId.set(m.id, m);
    const orderedMsgs: DbMessage[] = [];
    for (const id of ids) {
      const m = byId.get(id);
      if (m) orderedMsgs.push(m);
    }
    const slideCount = estimateSlideCount(orderedMsgs);
    if (slideCount > MAX_SLIDES) {
      return NextResponse.json(
        { error: `too_many_slides`, slideCount, maxSlides: MAX_SLIDES },
        { status: 400 }
      );
    }

    const post = createPost(user.id, conv.id, ids);
    return NextResponse.json(toPostResponse(post));
  } catch (err) {
    console.error('[posts] POST error:', err);
    return NextResponse.json({ error: 'invalid messageIds' }, { status: 400 });
  }
}

function directCardToItem(c: DbDirectCardWithAuthor) {
  const kind =
    c.type === 'video'
      ? 'video_card'
      : c.type === 'image'
        ? 'image_card'
        : 'texte_card';
  return {
    kind,
    id: c.id,
    user_id: c.user_id,
    type: c.type,
    media_url: c.media_url,
    caption: c.caption,
    text: c.text,
    bg_variant: c.bg_variant,
    createdAt: c.created_at,
    created_at: c.created_at,
    likes: c.likes,
    views: c.views,
    // Lot A : counters secondaires + discriminant pour CardActionsBar.
    card_kind: 'direct_card' as const,
    share_count: c.share_count ?? 0,
    comment_count: c.comment_count ?? 0,
    // Talk2Me #378 — auteur public pour le header card.
    author: c.author ?? null,
    // Talk2Me #422 — musique attachée (UnifiedCard JSON sérialisé)
    attached_audio_json: c.attached_audio_json ?? null,
    // Talk2Me #425 — produit attaché (ProductCardData JSON) → Hub + Shop
    attached_product_json: c.attached_product_json ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    let limit = limitParam ? parseInt(limitParam, 10) : 20;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    if (isNaN(offset) || offset < 0) offset = 0;

    // Lot A : si user authentifié, on hydrate `liked_by_me` sur chaque item
    // via 1 seul SELECT VALUES batch (cf getLikedCardIds).
    const me = getCurrentUserFromRequest(request);

    // Hub (Pascal 2026-06-07) : sous-onglets de tri.
    //   scope=friends → seulement les posts de mes amis (pas les miens).
    //   scope=shop    → seulement les cards commerce (posts avec ProductCard),
    //                   triées tendance (popular) par défaut, visibles par tous.
    //   sort=popular  → tri par engagement (likes×3+vues) au lieu de la date.
    const scope = url.searchParams.get('scope');
    const sortParam = url.searchParams.get('sort');
    const commerceOnly = scope === 'shop';
    // Shop : tendance par défaut "pour le moment".
    const sort =
      sortParam === 'popular' || (commerceOnly && sortParam !== 'recent')
        ? 'popular'
        : 'recent';
    let friendIds: string[] | undefined;
    if (scope === 'friends') {
      if (!me) {
        return NextResponse.json({ items: [], posts: [] });
      }
      friendIds = listFriends(me.id).map((u) => u.id);
      if (friendIds.length === 0) {
        return NextResponse.json({ items: [], posts: [] });
      }
    }

    // Flux unifié items[] = posts + direct_cards merge trié
    const mixed = getMixedFeed(limit, offset, {
      ...(friendIds ? { authorIds: friendIds } : {}),
      ...(commerceOnly ? { commerceOnly: true } : {}),
      sort,
    });

    // Construit la liste des candidats pour la requête batch likes.
    const candidates = mixed.map((m) =>
      m.kind === 'post'
        ? { kind: 'post' as const, id: m.data.id }
        : { kind: 'direct_card' as const, id: m.data.id }
    );
    const likedSet = me ? getLikedCardIds(me.id, candidates) : new Set<string>();

    const items = mixed.map((m) => {
      const cardKind = m.kind === 'post' ? 'post' : 'direct_card';
      const liked = likedSet.has(`${cardKind}:${m.data.id}`);
      if (m.kind === 'post') {
        return {
          kind: 'post' as const,
          ...toPostResponse(m.data),
          card_kind: 'post' as const,
          liked_by_me: liked,
          user_id: m.data.user_id,
          is_owner: !!me && me.id === m.data.user_id,
        };
      }
      const base = directCardToItem(m.data);
      return {
        ...base,
        liked_by_me: liked,
        is_owner: !!me && me.id === m.data.user_id,
      };
    });

    // Rétrocompat : on garde aussi posts[] (les clients legacy continuent de tourner)
    const posts = getPosts(limit);
    return NextResponse.json({
      items,
      posts: posts.map(toPostResponse),
    });
  } catch (err) {
    console.error('[posts] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
