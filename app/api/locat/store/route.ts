/** Talk2Me — LOCAT👀 : catalogue des BIENS À LOUER (recycle la boutique SHEIN, flag rental=1).
 *  GET → { categories:[{category, products:[{id,title,image,price_label,rate_unit}]}] }
 *  Public. Même forme que /api/shop/store → même storefront (SheinStore) réutilisé. */
import { NextResponse } from 'next/server';
import { getRentalCatalog } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const categories = getRentalCatalog(12).filter((c) => c.products.length > 0);
  return NextResponse.json({ ok: true, categories });
}
