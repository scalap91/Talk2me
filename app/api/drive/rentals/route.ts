/**
 * Talk2Me — Location de véhicules pour DRIVE (Pascal 2026-06-26).
 *  GET  ?city=…  → liste des véhicules en location (annonces Véhicules rental=1).
 *  POST { id }   → ouvre/retrouve la conversation avec le propriétaire (contacter).
 * Source UNIQUE = les annonces déposées (pas de duplication). Public en lecture.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRentalVehicles, getAnnonceForPurchase } from '@/lib/annonces-deposit';
import { createP2PConversation } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Distance haversine en km entre deux points (lat/lng en degrés). */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // rayon terrestre moyen (km)
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city') || undefined;
  const vehicles = getRentalVehicles(city ? { city } : {});
  // Proximité : si la position user est fournie, on ajoute distance_km à chaque
  // véhicule géolocalisé et on trie du plus proche au plus loin. Les véhicules
  // sans lat/lng gardent leur ordre (récents) et passent après ceux localisés.
  const latP = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lngP = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  if (Number.isFinite(latP) && Number.isFinite(lngP)) {
    const withDist = vehicles.map((v) => ({
      ...v,
      type: v.type, // attributes.type remonté au feed (filtre catégorie)
      distance_km: typeof v.lat === 'number' && typeof v.lng === 'number'
        ? Math.round(haversineKm(latP, lngP, v.lat, v.lng) * 10) / 10
        : null,
    }));
    withDist.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
    return NextResponse.json({ ok: true, vehicles: withDist });
  }
  return NextResponse.json({ ok: true, vehicles });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const a = getAnnonceForPurchase(id);
  if (!a || a.status !== 'published') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (a.user_id === me.id) return NextResponse.json({ error: 'own_listing' }, { status: 400 });
  try {
    const conv = createP2PConversation(me.id, a.user_id);
    return NextResponse.json({ ok: true, conversationId: conv.id });
  } catch (e) {
    return NextResponse.json({ error: 'contact_failed', detail: (e as Error).message }, { status: 500 });
  }
}
