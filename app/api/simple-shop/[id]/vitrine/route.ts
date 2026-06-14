/**
 * GET /api/simple-shop/[id]/vitrine (Pascal 2026-06-14)
 * Données pour la VITRINE feed d'une boutique : nom + mur d'articles (images).
 * → { ok, name, kind, items: [{ image_url, label, price_cents }] }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!getCurrentUserFromRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const items = listItems(id).map((it) => ({ id: it.id, image_url: it.image_url, label: it.label || '', price_cents: it.price_cents }));
  return NextResponse.json({ ok: true, name: shop.name, kind: shop.kind, items });
}
