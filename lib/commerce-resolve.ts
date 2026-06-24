'use server-only';
/**
 * Talk2Me — résolution SERVEUR d'une cible d'achat (Pascal 2026-06-24).
 * Source UNIQUE du prix + vendeur (jamais ceux du client) pour /api/commerce/buy
 * ET /api/commerce/quote. Gère les 3 types : annonce (déposée OU article badgé),
 * boutique/plat (par id ou clé, article unique ou panier).
 */
import { getSimpleShop, getSimpleShopByKey, listItems, getBoutiqueItemForPurchase } from '@/lib/simple-shop';
import { getAnnonceForPurchase } from '@/lib/annonces-deposit';

export interface ResolveBody { type?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string }
export interface OrderTarget { ok: boolean; error?: string; status?: number; priceCents?: number; sellerId?: string; itemId?: string; deliveryCents?: number; originLat?: number | null; originLng?: number | null }

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
    const shop = body.shop_id ? getSimpleShop(body.shop_id) : (body.shop_key ? getSimpleShopByKey(body.shop_key) : null);
    if (!shop) return { ok: false, error: 'shop_not_found', status: 404 };
    const sellerId = (shop as { owner_id: string }).owner_id;
    const catalog = listItems((shop as { id: string }).id);
    const lines = (body.items && body.items.length) ? body.items : (body.item_id ? [{ item_id: body.item_id, qty: 1 }] : []);
    if (!lines.length) return { ok: false, error: 'item_required', status: 400 };
    let priceCents = 0;
    for (const ln of lines) {
      const it = catalog.find((x) => x.id === ln.item_id);
      if (!it) return { ok: false, error: 'item_not_found', status: 404 };
      priceCents += it.price_cents * Math.max(1, Math.round(ln.qty || 1));
    }
    const itemId = lines.length === 1 ? lines[0].item_id : `cart:${(shop as { id: string }).id}`;
    // Frais de livraison fixes de la boutique (si définis) ; sinon calcul par distance
    // (fait dans la route à partir de la position du vendeur ci-dessous + celle de l'acheteur).
    const s = shop as { delivery_fee_cents?: number | null; lat?: number | null; lng?: number | null };
    const deliveryCents = Math.max(0, Math.round(s.delivery_fee_cents || 0));
    return { ok: true, priceCents, sellerId, itemId, deliveryCents, originLat: s.lat ?? null, originLng: s.lng ?? null };
  }

  return { ok: false, error: 'bad_type', status: 400 };
}
