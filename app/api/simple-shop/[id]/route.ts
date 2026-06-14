import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, getSimpleShopByKey, listItems, setWalletEnabled, updateShopDescription } from '@/lib/simple-shop';

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
    shop: { id: shop.id, name: shop.name, description: shop.description, public_key: shop.public_key, wallet_enabled: !!shop.wallet_enabled, owner_id: shop.owner_id, kind: shop.kind || 'boutique' },
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
  let body: { wallet_enabled?: boolean; description?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.wallet_enabled !== undefined) setWalletEnabled(id, me.id, body.wallet_enabled);
  let shopOut = shop;
  if (typeof body.description === 'string') {
    shopOut = updateShopDescription(id, me.id, body.description) || shop;
  }
  return NextResponse.json({ ok: true, shop: { id: shopOut.id, name: shopOut.name, description: shopOut.description } });
}
