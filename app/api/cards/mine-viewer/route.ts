/**
 * GET /api/cards/mine-viewer
 *
 * Talk2Me #383 (Pascal 2026-06-05) — Renvoie les cards de l'utilisateur
 * courant dans LA MÊME FORME que /api/posts (feed mixte) : `items[]` avec
 * `kind` discriminant + données complètes (messages, media_url, author).
 *
 * Utilisé par le viewer plein écran /mes-cards/[id] pour reconstruire le
 * scroll vertical en réutilisant PostCard / ImageCardDisplay /
 * VideoCardDisplay / TexteCardDisplay en mode `fullScreen`.
 *
 * Pascal verbatim : « card previcedente par odre de liste de la page card ».
 * Tri identique à /drafts onglet "Publiées" : order_position non-NULL d'abord
 * (ASC), puis created_at DESC. Cohérent avec drag & drop reorder.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserCardsForViewer, getLikedCardIds } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit = Math.max(
    1,
    Math.min(500, parseInt(sp.get('limit') || '100', 10) || 100)
  );
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0);

  const mixed = getUserCardsForViewer(me.id, limit, offset);

  // Hydrate liked_by_me en 1 SELECT (cf /api/posts pattern).
  const candidates = mixed.map((m) =>
    m.kind === 'post'
      ? { kind: 'post' as const, id: m.data.id }
      : { kind: 'direct_card' as const, id: m.data.id }
  );
  const likedSet = getLikedCardIds(me.id, candidates);

  const items = mixed.map((m) => {
    const cardKind = m.kind === 'post' ? 'post' : 'direct_card';
    const liked = likedSet.has(`${cardKind}:${m.data.id}`);
    if (m.kind === 'post') {
      const p = m.data;
      return {
        kind: 'post' as const,
        id: p.id,
        createdAt: p.created_at,
        likes: p.likes,
        views: p.views,
        author: p.author ?? null,
        user_id: p.user_id,
        card_kind: 'post' as const,
        liked_by_me: liked,
        is_owner: true,
        messages: p.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.text,
          links: msg.links,
          timestamp: msg.created_at,
          youtube: msg.youtube ?? null,
          places: msg.places ?? null,
          recipe: msg.recipe ?? null,
          requires_geoloc: msg.requires_geoloc ?? false,
          intent_query: msg.intent_query ?? null,
          intent_label_fr: msg.intent_label_fr ?? null,
          user_lat: msg.user_lat ?? null,
          user_lng: msg.user_lng ?? null,
          web_search: msg.web_search ?? null,
        })),
      };
    }
    const c = m.data;
    const kindNorm =
      c.type === 'video'
        ? 'video_card'
        : c.type === 'image'
          ? 'image_card'
          : 'texte_card';
    return {
      kind: kindNorm as 'video_card' | 'image_card' | 'texte_card',
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
      card_kind: 'direct_card' as const,
      share_count: c.share_count ?? 0,
      comment_count: c.comment_count ?? 0,
      author: c.author ?? null,
      liked_by_me: liked,
      is_owner: true,
    };
  });

  return NextResponse.json({ ok: true, items });
}
