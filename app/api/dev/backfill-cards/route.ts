/**
 * Backfill Card OS (Pascal 2026-07-03) : chaque `shop_products` → un vrai FICHIER `.card`
 * (public/cards/, envoyable) + indexé dans le moteur. Id déterministe → idempotent.
 * Sous `/api/dev/` (public, comme test-login), gaté par TEST_LOGIN_SECRET. Dual-write : ne
 * supprime rien. Démontre la boucle producteur→.card→index.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listAllShopProducts } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { writeCardFile } from '@/lib/cards/card-file';
import { makeCard } from '@/lib/cards/supercard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.TEST_LOGIN_SECRET;
  if (!secret || req.headers.get('x-backfill-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const products = listAllShopProducts();
  let written = 0, skipped = 0;
  const sample: string[] = [];

  for (const p of products) {
    const cid = 'card_shop_' + p.id;
    if (cardRepository.findById(cid)) { skipped++; continue; }

    let attached: Record<string, unknown> = {};
    try { attached = JSON.parse(p.attached_product_json || '{}'); } catch { /* */ }
    const priceLabel = String(attached.price_label || attached.priceLabel || '');
    const mm = priceLabel.replace(/\s/g, '').replace(',', '.').match(/[\d.]+/);
    const amount = mm ? Math.max(0, Math.round(parseFloat(mm[0]))) : 0;
    const img = p.media_url || (typeof attached.image_url === 'string' ? attached.image_url : '');

    const card = makeCard({
      title: p.caption || String(attached.title || 'Produit'),
      types: ['product'],
      channel: 'boutique',
      owner: p.user_id,
      state: 'published',
      images: img ? [img] : [],
      price: { amount, currency: 'MGA' },
      specs: { fournisseur: String(attached.source || 'CJ'), cost: String(attached.cost ?? ''), legacy_shop_product_id: p.id },
      source: { name: String(attached.source || 'CJ') },
      categories: p.category ? [p.category] : [],
      ...(attached.cj_pid ? { api: { provider: 'CJ', ref: String(attached.cj_pid) } } : {}),
    });
    card.id = cid;

    cardRepository.save(card);          // INDEX (moteur)
    await writeCardFile(card);          // FICHIER .card (public, envoyable)
    written++;
    if (sample.length < 3) sample.push(`/cards/${cid}.card`);
  }

  return NextResponse.json({ ok: true, total: products.length, written, skipped, sample });
}
