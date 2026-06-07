/**
 * POST /api/cards/[id]/views — Incrément du compteur vues d'une card.
 * Appelé par le front quand la card est visible >2s dans le viewport
 * (IntersectionObserver côté CardActionsBar).
 *
 * Query : ?kind=direct_card|post
 * Auth : facultatif (vues comptées même non connecté → MVP).
 *
 * Talk2Me Lot A (Pascal 2026-06-04).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  incrementCardViews,
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
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const kind = parseKind(request);
  if (!kind) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  incrementCardViews(kind, id, 1);
  return NextResponse.json({ ok: true });
}
