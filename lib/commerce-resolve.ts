'use server-only';
/**
 * Talk2Me — résolution SERVEUR d'une cible d'achat (Pascal 2026-06-24).
 * Source UNIQUE du prix + vendeur (jamais ceux du client) pour /api/commerce/buy
 * ET /api/commerce/quote. Gère les 3 types : annonce (déposée OU article badgé),
 * boutique/plat (par id ou clé, article unique ou panier).
 */
import { getSimpleShop, getSimpleShopByKey, listItems, getBoutiqueItemForPurchase } from '@/lib/simple-shop';
import { getAnnonceForPurchase } from '@/lib/annonces-deposit';
import { getBoutiqueById, getBoutiqueProducts, getShopProductForCard } from '@/lib/db';

// Taux de change → MGA (devise de CHARGE PaPi). Réglables par env, corrigeables sans redeploy.
// Les produits dropship sont libellés en €/$ (source AliExpress/CJ) mais on encaisse en Ariary :
// sans conversion, « 7 € » partait comme 7 Ar → sous le minimum PaPi (amount_too_small).
const EUR_TO_MGA = Math.max(1, Math.round(Number(process.env.EUR_TO_MGA_RATE) || 5000));
const USD_TO_MGA = Math.max(1, Math.round(Number(process.env.USD_TO_MGA_RATE) || 4600));

/** Prix d'un produit VITRINE (#428) depuis son attached_product_json (price_label), CONVERTI
 *  en MGA (devise de charge). Même convention que money.ts : MGA = entier (pas de ×100). */
function vitrinePriceMinor(attachedJson: string | null | undefined): number {
  try {
    const p = JSON.parse(attachedJson || '{}') as { price_label?: string; priceLabel?: string };
    const label = String(p.price_label || p.priceLabel || '');
    const m = label.replace(/\s/g, '').replace(',', '.').match(/[\d.]+/);
    if (!m) return 0;
    const n = Math.max(0, parseFloat(m[0]));
    if (n <= 0) return 0;
    // Devise du libellé → MGA. €/EUR et $/USD sont convertis ; sinon déjà en Ariary.
    if (/€|eur/i.test(label)) return Math.round(n * EUR_TO_MGA);
    if (/\$|usd/i.test(label)) return Math.round(n * USD_TO_MGA);
    return Math.round(n);
  } catch { return 0; }
}

export interface ResolveBody { type?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string }
export interface OrderTarget { ok: boolean; error?: string; status?: number; priceCents?: number; sellerId?: string; itemId?: string; deliveryCents?: number; originLat?: number | null; originLng?: number | null; dropship?: boolean }

export function resolveOrderTarget(body: ResolveBody): OrderTarget {
  const type = body.type || '';

  if (type === 'annonce') {
    const a = body.annonce_id ? getAnnonceForPurchase(body.annonce_id) : null;
    if (a) {
      if (a.status !== 'published') return { ok: false, error: 'annonce_unavailable', status: 400 };
      return { ok: true, priceCents: a.price_cents, sellerId: a.user_id, itemId: a.id };
    }
    // Fallback : l'annonce peut être un ARTICLE de boutique badgé (id = item_id).
    const it = body.annonce_id ? getBoutiqueItemForPurchase(body.annonce_id) : null;
    if (!it) return { ok: false, error: 'annonce_not_found', status: 404 };
    return { ok: true, priceCents: it.price_cents, sellerId: it.owner_id, itemId: it.id };
  }

  if (type === 'boutique' || type === 'plat') {
    const lines = (body.items && body.items.length) ? body.items : (body.item_id ? [{ item_id: body.item_id, qty: 1 }] : []);
    if (!lines.length) return { ok: false, error: 'item_required', status: 400 };

    // 1) Petite boutique / plat maison (simple-shop : boutique_items, price_cents en base).
    const shop = body.shop_id ? getSimpleShop(body.shop_id) : (body.shop_key ? getSimpleShopByKey(body.shop_key) : null);
    if (shop) {
      const sellerId = (shop as { owner_id: string }).owner_id;
      const catalog = listItems((shop as { id: string }).id);
      let priceCents = 0;
      for (const ln of lines) {
        const it = catalog.find((x) => x.id === ln.item_id);
        if (!it) return { ok: false, error: 'item_not_found', status: 404 };
        const qty = Math.max(1, Math.round(ln.qty || 1));
        // Validation STOCK côté serveur (Pascal 2026-07-11) : on ne vend jamais plus que le
        // stock déclaré. quantity null/0 = pas de limite (article sans gestion de stock).
        const stock = (it as { quantity?: number | null }).quantity;
        if (typeof stock === 'number' && stock > 0 && qty > stock) {
          return { ok: false, error: 'insufficient_stock', status: 409 };
        }
        priceCents += it.price_cents * qty;
      }
      const itemId = lines.length === 1 ? lines[0].item_id : `cart:${(shop as { id: string }).id}`;
      const s = shop as { delivery_fee_cents?: number | null; lat?: number | null; lng?: number | null };
      const deliveryCents = Math.max(0, Math.round(s.delivery_fee_cents || 0));
      return { ok: true, priceCents, sellerId, itemId, deliveryCents, originLat: s.lat ?? null, originLng: s.lng ?? null };
    }

    // 2) Card OS — résolution DIRECTE par produit-card, décorrélée de la table `boutiques`
    //    (Pascal 2026-07-03). Vendeur = user_id du produit, prix = attached_product_json
    //    (STRICTEMENT le même prix/vendeur que l'ancienne vitrine). Survit à la suppression
    //    de la table boutiques → le paiement ne dépend plus du conteneur.
    {
      let priceCents = 0; let sellerId = ''; let allFound = true; let dropship = false;
      for (const ln of lines) {
        const p = getShopProductForCard(ln.item_id);
        if (!p) { allFound = false; break; }
        const unit = vitrinePriceMinor(p.attached_product_json);
        if (unit <= 0) return { ok: false, error: 'price_unset', status: 400 };
        priceCents += unit * Math.max(1, Math.round(ln.qty || 1));
        sellerId = p.user_id;
        // Produit dropship (fournisseur CJ) → affiliation : le promoteur touche une part de notre marge.
        try { if (JSON.parse(p.attached_product_json || '{}')?.dropship) dropship = true; } catch { /* */ }
      }
      if (allFound && sellerId) {
        const itemId = lines.length === 1 ? lines[0].item_id : `cart:${sellerId}`;
        return { ok: true, priceCents, sellerId, itemId, dropship };
      }
    }

    // 2-bis) FALLBACK legacy vitrine (table `boutiques`) — retiré quand le multi-boutiques part.
    const vit = body.shop_id ? getBoutiqueById(body.shop_id) : null;
    if (vit) {
      const products = getBoutiqueProducts(vit.id);
      let priceCents = 0;
      for (const ln of lines) {
        const p = products.find((x) => x.id === ln.item_id);
        if (!p) return { ok: false, error: 'item_not_found', status: 404 };
        const unit = vitrinePriceMinor((p as { attached_product_json?: string | null }).attached_product_json);
        if (unit <= 0) return { ok: false, error: 'price_unset', status: 400 };
        priceCents += unit * Math.max(1, Math.round(ln.qty || 1));
      }
      const itemId = lines.length === 1 ? lines[0].item_id : `cart:${vit.id}`;
      return { ok: true, priceCents, sellerId: vit.user_id, itemId };
    }

    return { ok: false, error: 'shop_not_found', status: 404 };
  }

  return { ok: false, error: 'bad_type', status: 400 };
}
