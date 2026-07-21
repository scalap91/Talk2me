/**
 * GET /api/geo/cities?q=antan[&limit=8] → suggestions de villes de Madagascar.
 * Base LOCALE GeoNames (data/geo.db) : instantané, hors-ligne, chaque item porte lat/lng
 * → alimente directement le router OSRM (prix Drive) sans second appel de géocodage.
 * Public en lecture (aide à la saisie), pas de PII.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { searchCities } from '@/lib/geo-places';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '8', 10) || 8;
  if (q.length < 2) return NextResponse.json({ ok: true, cities: [] });
  try {
    const cities = searchCities(q, limit);
    return NextResponse.json({ ok: true, cities });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'geo_failed', detail: (e as Error).message, cities: [] }, { status: 200 });
  }
}
