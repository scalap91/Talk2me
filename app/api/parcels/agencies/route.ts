/**
 * GET /api/parcels/agencies?lat=&lng= — agences qui acceptent les colis de particuliers (P2P),
 * les plus proches d'abord. Sert l'écran « Envoyer un colis ». Pin + repère (Mada-first).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listParcelAgencies } from '@/lib/parcel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  const near = Number.isFinite(lat) && Number.isFinite(lng);
  const agencies = listParcelAgencies(near ? lat : undefined, near ? lng : undefined, 20, me.id).map((a) => ({
    uid: a.uid, name: a.name, depot_lat: a.depot_lat, depot_lng: a.depot_lng, depot_label: a.depot_label,
    base_cents: a.base_cents, per_km_cents: a.per_km_cents, dist_km: a.dist_km,
  }));
  return NextResponse.json({ ok: true, agencies });
}
