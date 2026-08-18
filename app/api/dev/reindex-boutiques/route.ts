/**
 * POST /api/dev/reindex-boutiques (Pascal 2026-08-18)
 * Ré-indexe les cartes VITRINE existantes avec la VRAIE carte boutique (buildBoutiqueCard :
 * types boutique + produits embarqués + titre propre) au lieu du dotcard-image laissé par le
 * backfill. Après ça, le feed unifié affiche la boutique + ses produits sans marqueur ni loader.
 * Gate : header x-dev-secret == TEST_LOGIN_SECRET (ou admin).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { getDb } from '@/lib/db';
import { getSimpleShop, listItems, buildBoutiqueCard } from '@/lib/simple-shop';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { writeCardFile } from '@/lib/cards/card-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-dev-secret');
  const bySecret = !!secret && secret === process.env.TEST_LOGIN_SECRET;
  if (!bySecret) {
    const me = getCurrentUserFromRequest(request);
    if (!me || !isAdminCapable(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const rows = getDb()
    .prepare("SELECT id, caption FROM direct_cards WHERE caption LIKE '%[VITRINE:%' AND deleted_at IS NULL")
    .all() as Array<{ id: string; caption: string }>;

  let reindexed = 0, skipped = 0;
  for (const r of rows) {
    const shopId = (r.caption || '').match(/\[VITRINE:([^\]]+)\]/)?.[1];
    if (!shopId) { skipped++; continue; }
    const shop = getSimpleShop(shopId);
    if (!shop) { skipped++; continue; } // boutique supprimée → carte fantôme, on laisse
    try {
      const items = listItems(shopId);
      const card = buildBoutiqueCard(r.id, shop, items, shop.owner_id);
      cardRepository.save(card);   // INDEX cards (source du feed)
      await writeCardFile(card);   // fichier .card (artefact)
      reindexed++;
    } catch { skipped++; }
  }
  return NextResponse.json({ total: rows.length, reindexed, skipped });
}
