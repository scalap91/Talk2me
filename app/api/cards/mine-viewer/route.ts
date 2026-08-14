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
import { getFeedFromCards, getCardFeedItem } from '@/lib/cards/feed-from-cards';
import { getLikedCardIds } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * UNIFICATION (Pascal 2026-08-14) : le viewer /mes-cards/[id] doit rendre EXACTEMENT
 * comme le FEED (doctrine « l'aperçu d'une publication = le feed »). On sert donc les cards
 * du user via le MÊME moteur que le feed — `getFeedFromCards` filtré sur mes cards — pour que
 * chaque item porte `dotcard` + la forme attendue par AlignedPostCard (le lecteur unique).
 * Avant : items sans `dotcard` rendus par les vieux *CardDisplay → « catastrophe » au clic.
 */
export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(500, parseInt(sp.get('limit') || '100', 10) || 100));
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0);
  // scope=shop → uniquement mes cards avec commerce attaché (règle « la pièce jointe = la catégorie »).
  const commerceOnly = sp.get('scope') === 'shop';

  const items = getFeedFromCards(limit, offset, {
    authorIds: [me.id],
    commerceOnly,
    meId: me.id,
  });

  // ?focus=<id> : ouvrir une card qui n'est PAS à moi (ex. onglet Likées). Si elle n'est pas déjà
  // dans mes cards, on la met EN TÊTE — via le même lecteur unique — au lieu du « card introuvable ».
  const focus = sp.get('focus');
  if (focus && !items.some((it) => it.id === focus)) {
    const extra = getCardFeedItem(focus, me.id);
    if (extra) items.unshift(extra);
  }

  // Hydrate liked_by_me (état du cœur) comme /api/posts. getFeedFromCards ne renvoie que des
  // cards (card_kind 'direct_card') → clé de like directe.
  const liked = getLikedCardIds(
    me.id,
    items.map((it) => ({ kind: 'direct_card' as const, id: it.id })),
  );
  const withLiked = items.map((it) => ({ ...it, liked_by_me: liked.has(`direct_card:${it.id}`) }));

  return NextResponse.json({ ok: true, items: withLiked });
}
