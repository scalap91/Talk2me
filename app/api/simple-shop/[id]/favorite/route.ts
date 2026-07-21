/**
 * POST /api/simple-shop/[id]/favorite — bascule le favori sur un shop (boutique/plat maison/resto).
 * « Garder ma Mama même quand je suis loin » (Pascal 2026-07-19) : le favori suit le shop, pas la
 * distance. → { ok, favorited }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, toggleShopFavorite } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const favorited = toggleShopFavorite(me.id, shop.id);
  return NextResponse.json({ ok: true, favorited });
}
