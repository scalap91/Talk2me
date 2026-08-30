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
import { getCardFeedItem } from '@/lib/cards/feed-from-cards';

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
  const base = getUserPublishedCards(me.id, limit, offset).filter((c) => c.type !== 'boutique' || boutiqueOn);
  // MOSAÏQUE PUBLIÉES (Pascal 2026-08-29, parité Brouillons) : chaque tuile se rend via le LECTEUR
  // UNIQUE → on joint `preview_item` (le .card mappé en item feed, comme /api/drafts). null si la card
  // n'est pas dans le moteur (legacy) → la tuile retombe sur sa miniature.
  const cards = base.map((c) => {
    let preview_item: unknown = null;
    try { preview_item = getCardFeedItem(c.id, me.id); } catch { /* fallback miniature */ }
    return { ...c, preview_item };
  });
  return NextResponse.json({ ok: true, cards });
}
