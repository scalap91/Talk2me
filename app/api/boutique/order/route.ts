/**
 * Boutique — POST /api/boutique/order (Pascal 2026-06-11).
 * Body : { shopId }. Crée (ou récupère) la conversation P2P entre l'acheteur et
 * le VENDEUR (owner de la boutique), non gatée par l'amitié. Le client envoie
 * ensuite le résumé du panier dans cette conv (endpoint messages classique) et
 * arrive sur le chat → la vente se conclut entre eux. Paiement à convenir
 * (cash / wallet plus tard — rien promis tant que le rail n'est pas live).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getBoutiqueById, getBoutiqueBySlug, createP2PConversation } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { shopId?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const shopId = (body.shopId || '').trim();
  if (!shopId) return NextResponse.json({ error: 'shop_required' }, { status: 400 });

  const boutique = getBoutiqueById(shopId) ?? getBoutiqueBySlug(shopId);
  if (!boutique) return NextResponse.json({ error: 'shop_not_found' }, { status: 404 });
  const sellerId = boutique.user_id;
  if (!sellerId) return NextResponse.json({ error: 'no_seller' }, { status: 400 });
  if (sellerId === me.id) return NextResponse.json({ error: 'own_shop' }, { status: 400 });

  try {
    const conv = createP2PConversation(me.id, sellerId);
    return NextResponse.json({ ok: true, conversationId: conv.id, sellerName: boutique.name });
  } catch (e) {
    return NextResponse.json({ error: 'order_failed', detail: (e as Error).message }, { status: 500 });
  }
}
