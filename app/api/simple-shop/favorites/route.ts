/**
 * GET /api/simple-shop/favorites — mes shops favoris (boutique/plat maison/resto),
 * INDÉPENDAMMENT de la distance (c'est tout l'intérêt : revoir ma Mama même loin de chez moi).
 * → { ok, shops: [{ id, name, kind, public_key, cover_url, items_count, address }] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listShopFavorites } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const shops = listShopFavorites(me.id).map((s) => ({
    id: s.id, name: s.name, kind: s.kind || 'boutique', public_key: s.public_key,
    cover_url: s.cover_url, items_count: s.items_count, address: s.address,
  }));
  return NextResponse.json({ ok: true, shops });
}
