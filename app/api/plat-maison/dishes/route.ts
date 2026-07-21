/**
 * GET /api/plat-maison/dishes?shop_id= — NIVEAU 2 : les plats d'une fiche « resto Mama »,
 * avec statut PAR plat (en ligne 24h / expiré / épuisé). Owner only. Pascal 2026-07-19.
 * → { ok, dishes: [{ id, label, price_cents, quantity, image_url, active_until, is_online }] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listPlatMaisonDishes } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const shopId = new URL(req.url).searchParams.get('shop_id') || '';
  if (!shopId) return NextResponse.json({ error: 'shop_id_required' }, { status: 400 });
  return NextResponse.json({ ok: true, dishes: listPlatMaisonDishes(shopId, me.id) });
}
