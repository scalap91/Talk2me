import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, getSimpleShopByKey, listItems, setWalletEnabled, updateShopDescription, updateShopGeo, updateShopName } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

// GET — vue publique : par id (gestion) OU par ?key= (partage). Renvoie shop + items.
export async function GET(req: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const key = req.nextUrl.searchParams.get('key');
  const shop = key ? getSimpleShopByKey(key) : getSimpleShop(id);
  if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    shop: { id: shop.id, name: shop.name, description: shop.description, public_key: shop.public_key, wallet_enabled: !!shop.wallet_enabled, owner_id: shop.owner_id, kind: shop.kind || 'boutique', category: shop.category, address: shop.address, cover_url: shop.cover_url, phone: shop.phone, hours: shop.hours, service_mode: shop.service_mode, delivery_fee_cents: shop.delivery_fee_cents, min_order_cents: shop.min_order_cents, prep_min: shop.prep_min },
    items: listItems(shop.id),
  });
}

// PATCH — toggle Wallet (owner only).
export async function PATCH(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { wallet_enabled?: boolean; description?: string; name?: string; lat?: number; lng?: number } = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.wallet_enabled !== undefined) setWalletEnabled(id, me.id, body.wallet_enabled);
  let shopOut = shop;
  if (typeof body.description === 'string') {
    shopOut = updateShopDescription(id, me.id, body.description) || shop;
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    shopOut = updateShopName(id, me.id, body.name) || shopOut;
  }
  if (Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
    shopOut = updateShopGeo(id, me.id, body.lat as number, body.lng as number) || shopOut;
  }
  return NextResponse.json({ ok: true, shop: { id: shopOut.id, name: shopOut.name, description: shopOut.description, cover_url: shopOut.cover_url, category: shopOut.category, address: shopOut.address, lat: shopOut.lat, lng: shopOut.lng } });
}
