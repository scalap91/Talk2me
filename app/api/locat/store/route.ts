/** Talk2Me — LOCAT👀 : catalogue des BIENS À LOUER (recycle la boutique SHEIN, flag rental=1).
 *  GET → { categories:[{category, products:[{id,title,image,price_label,rate_unit}]}] }
 *  Public. Même forme que /api/shop/store → même storefront (SheinStore) réutilisé. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRentalCatalog, getRentalNearby } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  // PROXIMITÉ (Pascal 2026-09-06) : si l'utilisateur fournit sa position, on renvoie UNE liste
  // « 📍 Autour de moi » triée du plus proche au plus loin (LOCAT = location de proximité).
  // Sans géo → catalogue classique par catégories (repli).
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const products = getRentalNearby({ lat, lng });
    return NextResponse.json({ ok: true, geo: true, categories: products.length ? [{ category: '📍 Autour de moi', products }] : [] });
  }
  const categories = getRentalCatalog(12).filter((c) => c.products.length > 0);
  return NextResponse.json({ ok: true, geo: false, categories });
}
