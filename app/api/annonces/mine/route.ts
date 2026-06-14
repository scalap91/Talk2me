/**
 * Talk2Me — Mes annonces déposées (Pascal 2026-06-11).
 * GET    → liste mes annonces (brouillons + publiées) + mes boutiques (pour rattacher).
 * POST   { id?, title, description, category, price, city, image_url, shop_id?, status }
 *        → crée/maj une annonce ('draft' ou 'published').
 * DELETE { id } → supprime.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { upsertAnnonce, listMyAnnonces, deleteAnnonce } from '@/lib/annonces-deposit';
import { listSimpleShops } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    annonces: listMyAnnonces(me.id),
    shops: listSimpleShops(me.id).map((s) => ({ id: s.id, name: s.name })),
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  if (!b.title || !String(b.title).trim()) return NextResponse.json({ error: 'title_required' }, { status: 400 });
  if (!b.category) return NextResponse.json({ error: 'category_required' }, { status: 400 });
  const status = b.status === 'published' ? 'published' : 'draft';
  const lat = typeof b.lat === 'number' ? b.lat : null;
  const lng = typeof b.lng === 'number' ? b.lng : null;
  // Pour PUBLIER : photo + prix + ville obligatoires.
  if (status === 'published' && (!b.image_url || b.price == null || !String(b.city || '').trim())) {
    return NextResponse.json({ error: 'incomplete', need: ['image_url', 'price', 'city'] }, { status: 400 });
  }
  // Les PLATS doivent être géoréférencés (économie de proximité, Pascal 2026-06-11).
  if (status === 'published' && b.category === 'Plat' && (lat == null || lng == null)) {
    return NextResponse.json({ error: 'geo_required', need: ['lat', 'lng'] }, { status: 400 });
  }
  const a = upsertAnnonce(me.id, {
    id: b.id, title: b.title, description: b.description, category: b.category,
    price: b.price, city: b.city, image_url: b.image_url, shop_id: b.shop_id, status, lat, lng,
  });
  if (!a) return NextResponse.json({ error: 'save_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, annonce: a });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  return NextResponse.json({ ok: deleteAnnonce(me.id, String(b.id)) });
}
