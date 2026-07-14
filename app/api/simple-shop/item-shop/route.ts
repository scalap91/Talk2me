/**
 * GET /api/simple-shop/item-shop?id=<itemId>
 * Talk2Me (Pascal 2026-07-14) — résout un produit/annonce attaché à un post → sa boutique,
 * pour ouvrir BoutiqueSheet (aperçu + achat PaPi) au tap sur l'overlay boutique du feed.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getItemShop } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = (request.nextUrl.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const shop = getItemShop(id);
  if (!shop) return NextResponse.json({ ok: false, shop: null });
  return NextResponse.json({ ok: true, ...shop });
}
