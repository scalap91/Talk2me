import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, addItem, deleteItem, updateItemImage, setItemAnnonce } from '@/lib/simple-shop';

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
  let body: { image_url?: string; price?: number; label?: string; description?: string; section?: string; annonce_on?: boolean; annonce_category?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.image_url) return NextResponse.json({ error: 'image_required' }, { status: 400 });
  // prix en € → centimes
  const cents = Math.round((Number(body.price) || 0) * 100);
  const item = addItem(id, body.image_url, cents, body.label || null, { description: body.description || null, section: body.section || null });
  // Opt-in « afficher aussi dans les Petites annonces » (choix vendeur, par article).
  if (body.annonce_on) setItemAnnonce(item.id, me.id, true, body.annonce_category || 'Autres');
  return NextResponse.json({ ok: true, item });
}

// PATCH { item_id, image_url } — remplace la photo (ex : après nettoyage IA, owner only).
export async function PATCH(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { item_id?: string; image_url?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.item_id || !body.image_url) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  const item = updateItemImage(id, body.item_id, body.image_url);
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
