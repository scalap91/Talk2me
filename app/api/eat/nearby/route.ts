/**
 * Talk2Me — EAT : fiches « à revendiquer » autour de toi.
 * Lit les fiches STOCKÉES (eat_listings). Si la zone n'a pas été synchronisée
 * récemment (>30 min), on relance un sync OSM+Mapillary (upsert + détection des
 * magasins disparus → alerte Telegram). Données publiques OSM, fiches internes.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { syncArea, listClaimable, areaKeyOf, areaLastSync } from '@/lib/eat-listings';
import { isShopSectionEnabled } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FRESH_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Section Eat coupée → aucune fiche resto (web + natif) ; on évite aussi le sync OSM/Mapillary inutile.
  if (!isShopSectionEnabled('eat')) return NextResponse.json({ ok: true, places: [] });
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'no_position' }, { status: 400 });
  const radius = Math.min(5000, Math.max(300, parseInt(req.nextUrl.searchParams.get('radius') || '1200', 10)));

  // Sync si la zone est vide ou périmée (>30 min) — sinon on sert la base direct.
  const area = areaKeyOf(lat, lng);
  const last = areaLastSync(area);
  if (last == null || Date.now() - last > FRESH_MS) {
    try { await syncArea(lat, lng, radius); } catch { /* OSM/Mapillary indispo → on sert ce qu'on a */ }
  }

  const places = listClaimable(lat, lng, Math.max(radius, 1500)).map((r) => ({
    id: r.osm_id, name: r.name, lat: r.lat, lng: r.lng, amenity: 'restaurant',
    cuisine: r.cuisine, emoji: r.emoji, address: r.address, phone: r.phone,
    opening_hours: r.opening_hours, photo: r.photo_url,
  }));
  return NextResponse.json({ ok: true, places, photos: !!process.env.MAPILLARY_TOKEN });
}
