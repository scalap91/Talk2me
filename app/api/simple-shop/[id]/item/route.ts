import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, addItem, deleteItem, updateItemImage, updateItemFields, setItemAnnonce, renewItemAnnonce } from '@/lib/simple-shop';
import { toMinor } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

// POST { image_url, price, label } — ajoute une photo+prix (owner only).
export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { image_url?: string; price?: number; label?: string; description?: string; section?: string; category?: string; attributes?: Record<string, string>; photos?: string[]; quantity?: number | null } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.image_url) return NextResponse.json({ error: 'image_required' }, { status: 400 });
  // prix saisi → plus petite unité de la devise du marché (toMinor : MGA sans ×100, EUR ×100)
  const cents = toMinor(Number(body.price) || 0);
  const attributes = body.attributes && typeof body.attributes === 'object' && Object.keys(body.attributes).length ? JSON.stringify(body.attributes) : null;
  const photos = Array.isArray(body.photos) && body.photos.length ? JSON.stringify(body.photos.filter((u) => typeof u === 'string').slice(0, 8)) : null;
  const item = addItem(id, body.image_url, cents, body.label || null, { description: body.description || null, section: body.section || null, category: body.category || null, attributes, photos, quantity: body.quantity ?? null });
  return NextResponse.json({ ok: true, item });
}

// PATCH — multi-actions sur un article (owner only) :
//   { item_id, image_url }                              → remplace la photo
//   { item_id, action:'edit', label?, price?, description? } → ré-édite l'article
//   { item_id, action:'annonce', on, category?, city?, lat?, lng? } → (dés)active dans les Petites annonces (validité 3 mois)
//   { item_id, action:'renew' }                          → renouvelle 3 mois
export async function PATCH(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { item_id?: string; image_url?: string; action?: string; label?: string; price?: number; description?: string; on?: boolean; category?: string; city?: string; lat?: number | null; lng?: number | null; attributes?: Record<string, string>; photos?: string[]; quantity?: number | null } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.item_id) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });

  let item = null;
  if (body.action === 'edit') {
    item = updateItemFields(id, body.item_id, {
      label: body.label, description: body.description, category: body.category,
      price_cents: body.price !== undefined ? toMinor(Number(body.price)) : undefined,
      attributes: body.attributes !== undefined ? (body.attributes && Object.keys(body.attributes).length ? JSON.stringify(body.attributes) : null) : undefined,
      photos: body.photos !== undefined ? (Array.isArray(body.photos) && body.photos.length ? JSON.stringify(body.photos.filter((u) => typeof u === 'string').slice(0, 8)) : null) : undefined,
      quantity: body.quantity !== undefined ? body.quantity : undefined,
    });
  } else if (body.action === 'annonce') {
    item = setItemAnnonce(id, me.id, body.item_id, !!body.on, { category: body.category, city: body.city, lat: body.lat ?? null, lng: body.lng ?? null });
  } else if (body.action === 'renew') {
    item = renewItemAnnonce(id, me.id, body.item_id);
  } else if (body.image_url) {
    item = updateItemImage(id, body.item_id, body.image_url);
  }
  if (!item) return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, item });
}

// DELETE { item_id } — retire une photo (owner only).
export async function DELETE(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { item_id?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.item_id) deleteItem(id, body.item_id);
  return NextResponse.json({ ok: true });
}
