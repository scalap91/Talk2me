/** Talk N Drive — le PASSAGER demande une course.
 *  POST {lat, lng, driver_id?, pickup_label?}  → crée la course (ciblée si driver_id).
 *  Pas de paiement : cash à bord. La coordination se fait ensuite par Appel/SMS. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createRide, getActiveRideForRider } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    driver_id?: string;
    pickup_label?: string;
    dest_lat?: number;
    dest_lng?: number;
    dest_label?: string;
    fare_cents?: number;
    distance_m?: number;
  };
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng))
    return NextResponse.json({ error: 'no_position' }, { status: 400 });
  // Une seule course active à la fois côté passager.
  const existing = getActiveRideForRider(me.id);
  if (existing) return NextResponse.json({ ok: true, ride: existing, existed: true });
  const { id } = createRide(me.id, b.lat as number, b.lng as number, b.driver_id ?? null, b.pickup_label ?? null, {
    destLat: Number.isFinite(b.dest_lat) ? (b.dest_lat as number) : null,
    destLng: Number.isFinite(b.dest_lng) ? (b.dest_lng as number) : null,
    destLabel: b.dest_label ?? null,
    fareCents: Number.isFinite(b.fare_cents) ? (b.fare_cents as number) : null,
    distanceM: Number.isFinite(b.distance_m) ? (b.distance_m as number) : null,
  });
  return NextResponse.json({ ok: true, ride_id: id, ride: getActiveRideForRider(me.id) });
}
