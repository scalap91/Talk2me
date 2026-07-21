import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, getSimpleShopByKey, listItems, setWalletEnabled, updateShopDescription, updateShopGeo, updateShopName, updateShopCover, updateShopListing, deleteSimpleShop, isShopFavorite, updateShopTariff, getShopTariff } from '@/lib/simple-shop';
import { purgeSalonForOwner } from '@/lib/salon';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

// GET — vue publique : par id (gestion) OU par ?key= (partage). Renvoie shop + items.
export async function GET(req: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const key = req.nextUrl.searchParams.get('key');
  const shop = key ? getSimpleShopByKey(key) : getSimpleShop(id);
  if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  return NextResponse.json({
    ok: true,
    shop: { id: shop.id, name: shop.name, description: shop.description, public_key: shop.public_key, wallet_enabled: !!shop.wallet_enabled, owner_id: shop.owner_id, kind: shop.kind || 'boutique', category: shop.category, address: shop.address, cover_url: shop.cover_url, phone: shop.phone, hours: shop.hours, service_mode: shop.service_mode, delivery_fee_cents: shop.delivery_fee_cents, min_order_cents: shop.min_order_cents, prep_min: shop.prep_min, is_favorite: me ? isShopFavorite(me.id, shop.id) : false, tariff: (shop.kind === 'service') ? getShopTariff(shop.id) : [] },
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
  let body: { wallet_enabled?: boolean; description?: string; name?: string; cover_url?: string; lat?: number; lng?: number; category?: string; service_mode?: string; address?: string; tariff_json?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.wallet_enabled !== undefined) setWalletEnabled(id, me.id, body.wallet_enabled);
  // Grille tarifaire (service) : JSON [{label, price}]. Pascal 2026-07-19.
  if (typeof body.tariff_json === 'string') updateShopTariff(id, me.id, body.tariff_json || null);
  let shopOut = shop;
  // Édition annonce-listing (service/emploi) : métier/type + tarif/rému + zone/lieu en une passe,
  // + réécrit le .card. Route ces champs par updateShopListing (les autres kinds ne les envoient pas).
  if (typeof body.category === 'string' || typeof body.service_mode === 'string' || typeof body.address === 'string') {
    shopOut = updateShopListing(id, me.id, { category: body.category, serviceMode: body.service_mode, address: body.address }) || shopOut;
  }
  if (typeof body.description === 'string') {
    shopOut = updateShopDescription(id, me.id, body.description) || shopOut;
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    shopOut = updateShopName(id, me.id, body.name) || shopOut;
  }
  if (typeof body.cover_url === 'string' && body.cover_url.trim()) {
    shopOut = updateShopCover(id, me.id, body.cover_url) || shopOut;
  }
  if (Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
    shopOut = updateShopGeo(id, me.id, body.lat as number, body.lng as number) || shopOut;
  }
  return NextResponse.json({ ok: true, shop: { id: shopOut.id, name: shopOut.name, description: shopOut.description, cover_url: shopOut.cover_url, category: shopOut.category, address: shopOut.address, service_mode: shopOut.service_mode, lat: shopOut.lat, lng: shopOut.lng } });
}

// DELETE — supprime le shop/profil (owner only). Nettoyage COMPLET (pas de code/donnée mort, règle
// absolue Pascal) : items + shop + .card + toutes les traces salon (VIP / vidéos live / déverrouillages).
export async function DELETE(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const itemIds = listItems(id).map((it) => it.id);
  const ok = deleteSimpleShop(id, me.id);
  if (!ok) return NextResponse.json({ error: 'delete_failed' }, { status: 400 });
  try { purgeSalonForOwner(me.id, itemIds); } catch { /* best-effort */ }
  // .card sur disque (shop + items) — data/ et public/.
  for (const cid of [id, ...itemIds]) {
    for (const base of ['data/cards', 'public/cards']) {
      try { await unlink(join(process.cwd(), base, `${cid}.card`)); } catch { /* absent */ }
    }
  }
  return NextResponse.json({ ok: true });
}
