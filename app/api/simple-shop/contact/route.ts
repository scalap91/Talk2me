/**
 * Talk2Me — Contacter le vendeur d'une petite boutique (Pascal 2026-06-11).
 * POST { key } → crée (ou récupère) la conversation P2P acheteur↔vendeur (owner
 * de la simple_shop), non gatée par l'amitié. Renvoie conversationId pour ouvrir
 * le chat. La vente se conclut entre eux (paiement à convenir, rail pas live).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShopByKey, getSimpleShop } from '@/lib/simple-shop';
import { createP2PConversation } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { key?: string; shopId?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const shop = body.key ? getSimpleShopByKey(body.key.trim()) : (body.shopId ? getSimpleShop(body.shopId.trim()) : null);
  if (!shop) return NextResponse.json({ error: 'shop_not_found' }, { status: 404 });
  if (shop.owner_id === me.id) return NextResponse.json({ error: 'own_shop' }, { status: 400 });
  try {
    const conv = createP2PConversation(me.id, shop.owner_id);
    return NextResponse.json({ ok: true, conversationId: conv.id, sellerName: shop.name });
  } catch (e) {
    return NextResponse.json({ error: 'contact_failed', detail: (e as Error).message }, { status: 500 });
  }
}
