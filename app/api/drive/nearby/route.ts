/** Talk N Drive — chauffeurs en ligne les plus proches d'un point de prise.
 *  GET ?lat=&lng=  → liste triée (favoris d'abord, puis distance). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getNearbyDrivers } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return NextResponse.json({ error: 'no_position' }, { status: 400 });
  return NextResponse.json({ ok: true, drivers: getNearbyDrivers(me.id, lat, lng) });
}
