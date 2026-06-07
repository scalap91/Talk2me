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
  VALID_CARD_KINDS_FOR_CRUD,
  type CardKindForCrud,
} from '@/lib/db';

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
