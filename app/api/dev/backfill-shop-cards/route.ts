/**
 * /api/dev/backfill-shop-cards — écrit le fichier `.card` de TOUS les produits boutique
 * (shop_products) existants (migration Card OS, Pascal 2026-07-11 « tout est card »). Idempotent.
 */
import { NextResponse } from 'next/server';
import { backfillShopCards } from '@/lib/db-commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const written = await backfillShopCards();
  return NextResponse.json({ ok: true, written });
}
