/** Talk N Drive — côté CHAUFFEUR.
 *  GET  : son état (profil, demandes en attente, course active).
 *  POST : {action:'set', online, lat, lng, vehicle_type}  → en ligne / heartbeat
 *         {action:'accept', ride_id}                       → accepte une course
 *         {action:'status', ride_id, to}                   → transition (en_route/a_bord/terminee/annulee)
 *  PAIEMENT (Pascal 2026-07-17, cash INTERDIT) : la course est payée par le passager (escrow PaPi) ;
 *  ici on LIBÈRE l'escrow au chauffeur à `terminee`, on le REMBOURSE à `annulee`. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  setDriverStatus,
  getDriverProfile,
  getDriverRequests,
  getDriverActiveRide,
  updateRideStatus,
  getRideRow,
  type VehicleType,
  type RideStatus,
} from '@/lib/db';
import { releaseEscrow, refundEscrow } from '@/lib/escrow';

/** Règle l'escrow de la course selon le statut terminal. Best-effort (ne casse pas la transition). */
function settleRideEscrow(rideId: string, to: RideStatus): void {
  try {
    const row = getRideRow(rideId);
    if (!row?.escrow_id || !row.paid) return;
    if (to === 'terminee') releaseEscrow(row.escrow_id);
    else if (to === 'annulee') refundEscrow(row.escrow_id);
  } catch { /* réglable aussi via /api/wallet/escrow au besoin */ }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    profile: getDriverProfile(me.id),
    requests: getDriverRequests(me.id),
    active: getDriverActiveRide(me.id),
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    action?: string;
    online?: boolean;
    lat?: number;
    lng?: number;
    vehicle_type?: string;
    ride_id?: string;
    to?: string;
  };

  if (b.action === 'set') {
    const vt = (['tuktuk', 'moto', 'voiture'].includes(b.vehicle_type || '') ? b.vehicle_type : 'tuktuk') as VehicleType;
    setDriverStatus(me.id, b.online === true, b.lat ?? null, b.lng ?? null, vt);
    return NextResponse.json({ ok: true, profile: getDriverProfile(me.id) });
  }
  if (b.action === 'accept') {
    if (!b.ride_id) return NextResponse.json({ error: 'no_ride' }, { status: 400 });
    const r = updateRideStatus(b.ride_id, me.id, 'acceptee', me.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, active: getDriverActiveRide(me.id) });
  }
  if (b.action === 'status') {
    const allowed: RideStatus[] = ['en_route', 'a_bord', 'terminee', 'annulee'];
    if (!b.ride_id || !allowed.includes(b.to as RideStatus))
      return NextResponse.json({ error: 'bad_args' }, { status: 400 });
    const r = updateRideStatus(b.ride_id, me.id, b.to as RideStatus);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    settleRideEscrow(b.ride_id, b.to as RideStatus); // libère au chauffeur (terminee) / rembourse (annulee)
    return NextResponse.json({ ok: true, active: getDriverActiveRide(me.id) });
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
