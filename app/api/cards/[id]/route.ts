/**
 * /api/cards/[id]
 *   DELETE   — soft-delete (par défaut) ou hard-delete (`?hard=1`) d'une card
 *              publiée. Vérifie l'ownership. Body/Query : `kind=direct_card|post`.
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14.
 *
 * Soft-delete (défaut) :
 *   - La card disparaît du feed Home + Mes Cards + Profil + Recherche.
 *   - Elle reste 30j dans /trash (restaurable).
 *   - Les saved_cards pointant dessus sont filtrées à l'affichage (skip).
 *
 * Hard-delete (?hard=1) :
 *   - Disparition immédiate ET définitive. Réservé à la page /trash
 *     "Supprimer définitivement". Vérifie ownership.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  softDeleteCard,
  hardDeleteCard,
  VALID_CARD_KINDS_FOR_CRUD,
  type CardKindForCrud,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

/** Normalise le param `kind` depuis la query string. */
function parseKind(req: NextRequest): CardKindForCrud | null {
  const raw = (req.nextUrl.searchParams.get('kind') || '').trim();
  if (VALID_CARD_KINDS_FOR_CRUD.includes(raw as CardKindForCrud)) {
    return raw as CardKindForCrud;
  }
  return null;
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

  const hard = request.nextUrl.searchParams.get('hard') === '1';

  const ok = hard
    ? hardDeleteCard(me.id, kind, id)
    : softDeleteCard(me.id, kind, id);

  if (!ok) {
    return NextResponse.json(
      { error: 'not_found_or_not_owner' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, hard });
}
