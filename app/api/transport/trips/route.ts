/**
 * Talk2Me — Trajets déclarés par les porteurs (Brique B). Porteur CNI-vérifié requis.
 * GET  → mes trajets. POST → déclarer un trajet { o{lat,lng,label}, d{...}, depart_at, duration_min, mode }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { declareTrip, listMyTrips, closeTrip, type TripMode } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MODES: TripMode[] = ['pied', 'velo', 'moto', 'scooter', 'voiture', 'taxibrousse'];

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, trips: listMyTrips(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (b.action === 'close' && typeof b.trip_id === 'string') { closeTrip(me.id, b.trip_id); return NextResponse.json({ ok: true, trips: listMyTrips(me.id) }); }
  const o = b.o as Record<string, number & string> | undefined, d = b.d as Record<string, number & string> | undefined;
  if (!o || !d || typeof o.lat !== 'number' || typeof d.lat !== 'number') return NextResponse.json({ error: 'bad_points' }, { status: 400 });
  const mode = (typeof b.mode === 'string' && MODES.includes(b.mode as TripMode)) ? b.mode as TripMode : 'taxibrousse';
  const r = declareTrip(me.id, {
    oLat: o.lat, oLng: o.lng, oLabel: String(o.label || ''),
    dLat: d.lat, dLng: d.lng, dLabel: String(d.label || ''),
    departAt: Number(b.depart_at) || Date.now(), durationMin: Number(b.duration_min) || 60, mode,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id, trips: listMyTrips(me.id) });
}
