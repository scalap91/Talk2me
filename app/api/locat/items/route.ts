/** LOCAT👀 — MES biens à louer (shop_products rental=1). GET liste · POST crée · DELETE.
 *  Un bien à louer = un shop_product (rental=1) → écrit la .card + lu par le lecteur Boutique.
 *  Recycle la boutique SHEIN, ZÉRO annonce. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createShopProduct, updateShopProduct } from '@/lib/db-commerce';
import { listMyRentalItems, softDeleteShopProduct } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_UNITS = ['heure', 'jour', 'semaine', 'week-end'];

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, items: listMyRentalItems(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(b.title || '').trim().slice(0, 120);
  const image_url = String(b.image_url || '').trim();
  // TAXONOMIE 2 NIVEAUX (Pascal 2026-09-07) : `family` (label de famille) = colonne `category` (niveau 1
  // du browse) ; `subcategory` (niveau 2) stockée dans le JSON. Repli sur `category` libre (rétro-compat).
  const family = String(b.family || '').trim().slice(0, 60);
  const subcategory = String(b.subcategory || '').trim().slice(0, 60);
  const category = family || (String(b.category || '').trim().slice(0, 60)) || 'Autres';
  const rate_unit = RATE_UNITS.includes(String(b.rate_unit)) ? String(b.rate_unit) : 'jour';
  const price = Math.max(0, Math.round(Number(b.price) || 0));
  const description = String(b.description || '').trim().slice(0, 1000);
  const depositMode = ['none', 'engagement', 'cash'].includes(String(b.deposit_mode)) ? String(b.deposit_mode) : 'engagement';
  const deposit = depositMode === 'none' ? 0 : Math.max(0, Math.round(Number(b.deposit) || 0)); // caution (Ar)
  if (!title || !image_url || !price) {
    return NextResponse.json({ error: 'missing', need: 'title + image + price' }, { status: 400 });
  }
  const price_label = `${price.toLocaleString('fr-FR')} Ar / ${rate_unit}`;
  // PROXIMITÉ (Pascal 2026-09-06) : position du bien, captée à la création → tri « autour de moi ».
  const lat = typeof b.lat === 'number' && Number.isFinite(b.lat) ? b.lat : null;
  const lng = typeof b.lng === 'number' && Number.isFinite(b.lng) ? b.lng : null;
  // Montants en ARIARY entier (pas de centimes). price_label = source d'affichage + de calcul.
  const attached = JSON.stringify({ title, image_url, price_label, rate_unit, description, price_ar: price, deposit_ar: deposit, deposit_mode: depositMode, lat, lng, subcategory: subcategory || null });
  const { id } = createShopProduct(me.id, {
    media_url: image_url, caption: title, attached_product_json: attached,
    boutique_id: `locat-${me.id}`, category, rental: 1,
  });
  return NextResponse.json({ ok: true, id });
}

// MODIFIER un bien à louer (Pascal 2026-09-14 : « on doit pouvoir modifier une annonce, ex. changer
// de catégorie »). Même parsing que POST mais met à jour la ligne existante (owner-gated par id+user).
export async function PUT(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  const title = String(b.title || '').trim().slice(0, 120);
  const image_url = String(b.image_url || '').trim();
  const family = String(b.family || '').trim().slice(0, 60);
  const subcategory = String(b.subcategory || '').trim().slice(0, 60);
  const category = family || (String(b.category || '').trim().slice(0, 60)) || 'Autres';
  const rate_unit = RATE_UNITS.includes(String(b.rate_unit)) ? String(b.rate_unit) : 'jour';
  const price = Math.max(0, Math.round(Number(b.price) || 0));
  const description = String(b.description || '').trim().slice(0, 1000);
  const depositMode = ['none', 'engagement', 'cash'].includes(String(b.deposit_mode)) ? String(b.deposit_mode) : 'engagement';
  const deposit = depositMode === 'none' ? 0 : Math.max(0, Math.round(Number(b.deposit) || 0));
  if (!title || !image_url || !price) {
    return NextResponse.json({ error: 'missing', need: 'title + image + price' }, { status: 400 });
  }
  const price_label = `${price.toLocaleString('fr-FR')} Ar / ${rate_unit}`;
  const lat = typeof b.lat === 'number' && Number.isFinite(b.lat) ? b.lat : null;
  const lng = typeof b.lng === 'number' && Number.isFinite(b.lng) ? b.lng : null;
  const attached = JSON.stringify({ title, image_url, price_label, rate_unit, description, price_ar: price, deposit_ar: deposit, deposit_mode: depositMode, lat, lng, subcategory: subcategory || null });
  const ok = updateShopProduct(me.id, id, { media_url: image_url, caption: title, attached_product_json: attached, category });
  return NextResponse.json({ ok });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  return NextResponse.json({ ok: softDeleteShopProduct(me.id, id) });
}
