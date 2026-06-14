/** Talk N Drive — suivi LIVE d'une course (pour la carte : voir le chauffeur arriver).
 *  GET ?id=<rideId>  → { ride, driver_pos:{lat,lng}|null }
 *  Accès réservé aux 2 parties de la course (passager ou chauffeur). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRideLive } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  const data = getRideLive(id);
  if (!data) return NextResponse.json({ error: 'no_ride' }, { status: 404 });
  if (data.ride.rider?.id !== me.id && data.ride.driver?.id !== me.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, ...data });
}
