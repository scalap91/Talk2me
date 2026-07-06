/**
 * Talk2Me — LIVE SHOPPING · /api/live/products  (Pascal 2026-07-05)
 * GET → produits des boutiques de l'UTILISATEUR COURANT (le diffuseur), pour le
 * sélecteur « 🛍️ Mes produits » qu'il épingle pendant son live.
 *
 * Source = simple-shop (boutiques du particulier). On renvoie juste de quoi
 * afficher une vignette + le contexte boutique ; le `.card` complet (source de
 * vérité + bouton Acheter) est relu SERVEUR au moment d'épingler (POST product).
 * Aucune PII : ids boutique uniquement, jamais de talk2me_id/téléphone/email.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listSimpleShops, listItems } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });

  const shops = listSimpleShops(me.id);
  const products: Array<{
    id: string; shopId: string; shopName: string; kind: string | null;
    label: string; price_cents: number; image_url: string;
  }> = [];
  for (const shop of shops) {
    for (const it of listItems(shop.id)) {
      if (!it.image_url) continue; // pas d'image → on ne peut pas l'épingler proprement
      products.push({
        id: it.id,
        shopId: shop.id,
        shopName: shop.name,
        kind: shop.kind,
        label: it.label || 'Article',
        price_cents: it.price_cents,
        image_url: it.image_url,
      });
      if (products.length >= 60) break;
    }
    if (products.length >= 60) break;
  }
  return Response.json({ ok: true, products });
}
