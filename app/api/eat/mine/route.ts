/**
 * GET /api/eat/mine — MES restaurants (kind='eat', owner = moi). Sert au composer Restaurant
 * (première page = ma liste de restos + « + »). Pascal 2026-07-19.
 * → { ok, restaurants: [{ id, name, description, public_key, cover_url, items_count, lat, lng, prep_min }] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listMyEatShops } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, restaurants: listMyEatShops(me.id) });
}
