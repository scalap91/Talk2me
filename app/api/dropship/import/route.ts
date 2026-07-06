/** Talk2Me — Dropshipping : importer un produit fournisseur dans MA boutique.
 *  POST { boutique_id, pid, price, category? }
 *   - récupère le détail réel du produit chez CJ (photo, nom)
 *   - crée une card produit dans la boutique (prix = TON prix de vente)
 *   - garde le pid + le coût fournisseur pour la commande automatique plus tard
 *  Le vendeur ne stocke rien : à la vente, CJ expédiera (entrepôt France). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb, createShopProduct } from '@/lib/db';
import { cjConfigured, cjProductDetail, CjError } from '@/lib/cj-dropshipping';
import { cardService } from '@/lib/cards/engine/card.service';
import { writeCardFile } from '@/lib/cards/card-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!cjConfigured()) return NextResponse.json({ error: 'cj_not_configured' }, { status: 400 });

  const b = (await req.json().catch(() => ({}))) as {
    boutique_id?: string;
    pid?: string;
    price?: string | number;
    category?: string;
  };
  if (!b.boutique_id || !b.pid) return NextResponse.json({ error: 'bad_args' }, { status: 400 });

  // La boutique doit appartenir à l'utilisateur.
  const bq = getDb()
    .prepare('SELECT id, user_id, kind FROM boutiques WHERE id = ?')
    .get(b.boutique_id) as { id: string; user_id: string; kind: string } | undefined;
  if (!bq) return NextResponse.json({ error: 'no_boutique' }, { status: 404 });
  if (bq.user_id !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let detail;
  try {
    detail = await cjProductDetail(b.pid);
  } catch (e) {
    const code = e instanceof CjError ? e.code : 'error';
    return NextResponse.json({ error: code }, { status: 502 });
  }
  if (!detail.image) return NextResponse.json({ error: 'no_image' }, { status: 422 });

  // Prix de vente = ce que le vendeur fixe ; à défaut, le coût fournisseur.
  const sellPrice =
    b.price != null && String(b.price).trim() ? String(b.price).trim() : detail.price != null ? `${detail.price}` : '';

  const attachedProduct = {
    title: detail.name,
    image_url: detail.image,
    price_label: sellPrice,
    source: 'CJ',
    source_url: '',
    // métadonnées de fulfillment (sert la commande auto + marge)
    cj_pid: detail.pid,
    cost: detail.price,
    dropship: true,
  };

  // Catalogue séparé : le produit va dans shop_products, PAS dans direct_cards
  // (qui ne contient plus que les cards perso).
  const card = createShopProduct(me.id, {
    type: 'image',
    media_url: detail.image,
    caption: detail.name,
    attached_product_json: JSON.stringify(attachedProduct),
    boutique_id: b.boutique_id,
    category: (b.category || 'Boutique').trim(),
  });

  // Card OS (Pascal 2026-07-03) : la SOURCE dropship se branche sur le MOTEUR — CJ envoie
  // ses données, le moteur produit la VRAIE card (owner=vendeur, price sur la card, provider
  // en api.ref pour le prix live). Une seule card, lisible par TOUS les lecteurs (Shop, feed,
  // recherche, paiement). Dual-write additif : ne bloque jamais l'import legacy.
  let moteurId: string | null = null;
  try {
    const priceNum = parseFloat(String(sellPrice).replace(',', '.')) || 0;
    const mc = cardService.createCard({
      title: detail.name,
      types: ['product'],
      channel: 'boutique',
      owner: me.id,
      state: 'published',
      images: [detail.image],
      price: { amount: priceNum, currency: 'MGA' },
      specs: { cost: String(detail.price ?? ''), fournisseur: 'CJ' },
      source: { name: 'CJ' },
      api: { provider: 'CJ', ref: detail.pid },
      categories: [(b.category || 'Boutique').trim()],
    });
    await writeCardFile(mc);   // → vrai fichier public/cards/<id>.card, envoyable comme un PDF
    moteurId = mc.id;
  } catch { /* moteur en rodage — l'import legacy reste la source de vérité pour l'instant */ }

  return NextResponse.json({ ok: true, card_id: card.id, moteur_card_id: moteurId });
}
