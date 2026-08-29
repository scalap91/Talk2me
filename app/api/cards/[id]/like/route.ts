/**
 * /api/cards/[id]/like
 *   POST   — like (idempotent, optimistic-friendly)
 *   DELETE — unlike (idempotent)
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14 ("❤️ J'aime avec mise à jour en temps réel").
 *
 * Query : ?kind=direct_card|post (obligatoire — l'id seul ne distingue pas
 *         les 2 tables).
 *
 * Réponse :
 *   - POST   { ok: true, liked: true,  likes: <new_count> }
 *   - DELETE { ok: true, liked: false, likes: <new_count> }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  likeCard,
  unlikeCard,
  isLikedByUser,
  readCardLikesCount,
  getCardOwner,
  getUserById,
  VALID_CARD_KINDS_FOR_CRUD,
  type CardKindForCrud,
} from '@/lib/db';
import { createNotifOnce } from '@/lib/notifs';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function parseKind(req: NextRequest): CardKindForCrud | null {
  const raw = (req.nextUrl.searchParams.get('kind') || '').trim();
  if (VALID_CARD_KINDS_FOR_CRUD.includes(raw as CardKindForCrud)) {
    return raw as CardKindForCrud;
  }
  return null;
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const kind = parseKind(request);
  if (!kind) {
    return NextResponse.json(
      { error: 'invalid_kind', hint: 'kind=direct_card|post' },
      { status: 400 }
    );
  }

  // Idempotent : si déjà liké, on ne fait rien.
  const wasLiked = isLikedByUser(me.id, kind, id);
  if (!wasLiked) {
    const ok = likeCard(me.id, kind, id);
    if (!ok) {
      return NextResponse.json(
        { error: 'card_not_found_or_deleted' },
        { status: 404 }
      );
    }
    // NOTIF « on t'a liké » (Pascal 2026-08-29) : nouveau like uniquement, jamais soi-même, DÉDUPLIQUÉE
    // (1 par personne par card). In-app (avatar + profil du liker, tap → la card) + push best-effort.
    try {
      const owner = getCardOwner(kind, id);
      const ownerId = owner?.user_id;
      if (ownerId && ownerId !== me.id) {
        const liker = getUserById(me.id) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
        const name = (liker?.display_name || liker?.username || 'Quelqu’un').toString().trim();
        const link = `/mes-cards/${id}`;
        createNotifOnce(ownerId, 'like', `${name} a liké ton post`, '❤️', link, me.id, liker?.avatar_url ?? null);
        void sendPushToUser(ownerId, { title: `❤️ ${name} a liké ton post`, body: '', url: link, tag: `like-${id}`, store: false });
      }
    } catch { /* best-effort : ne bloque JAMAIS le like */ }
  }
  const likes = readCardLikesCount(kind, id);
  return NextResponse.json({ ok: true, liked: true, likes });
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const kind = parseKind(request);
  if (!kind) {
    return NextResponse.json(
      { error: 'invalid_kind', hint: 'kind=direct_card|post' },
      { status: 400 }
    );
  }

  unlikeCard(me.id, kind, id);
  const likes = readCardLikesCount(kind, id);
  return NextResponse.json({ ok: true, liked: false, likes });
}
