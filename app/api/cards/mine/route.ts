/**
 * /api/cards/mine (GET)
 *
 * Talk2Me #336 (Pascal 2026-06-04) — Liste des cards publiées par le user
 * courant (direct_cards + posts/clips de conversation), pour l'onglet
 * "Publiées" de /drafts (page "Mes cards").
 *
 * Doctrine [[talk2me-card-editor-ia]] : l'utilisateur doit retrouver dans son
 * espace toutes les cards qu'il a publiées, à côté de ses brouillons.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserPublishedCards } from '@/lib/db';
import { isShopSectionEnabled } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const limitRaw = Number(sp.get('limit') || '50');
  const offsetRaw = Number(sp.get('offset') || '0');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

  // « Section OFF → coupé PARTOUT » (Pascal 2026-08-13) : on retire de l'espace Card les
  // publications d'une section désactivée. Ici les publications sont des direct_cards (sans
  // colonne channel) : le seul type sectionné réellement présent est la VITRINE boutique
  // (type 'boutique'). Les autres (image/video/texte/formation/conv) = neutres → jamais coupés.
  const boutiqueOn = isShopSectionEnabled('boutique');
  const cards = getUserPublishedCards(me.id, limit, offset).filter((c) => c.type !== 'boutique' || boutiqueOn);
  return NextResponse.json({ ok: true, cards });
}
