import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listEatRestaurants } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — restaurants (kind='eat') de l'onglet Eat. Source = eat.db (listEatRestaurants), PAS
// getRestaurants qui lisait la main db simple_shops (0 resto) → le feed était vide. Pascal 2026-07-19.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, restaurants: listEatRestaurants() });
}
