/**
 * GET /api/radar?lat&lng&radius (Pascal 2026-06-15)
 * Le « radar » : tout ce qui est détecté autour de moi (preuve que la géoloc
 * 500 m marche). Renvoie plats maison + restos à proximité, avec distance et
 * position (pour placer les blips sur le radar).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listShopsNearby } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  if (isNaN(lat) || isNaN(lng)) return NextResponse.json({ error: 'position_required' }, { status: 400 });
  let radius = parseInt(req.nextUrl.searchParams.get('radius') || '500', 10);
  if (isNaN(radius) || radius <= 0 || radius > 5000) radius = 500;

  const map = (kind: 'plat' | 'resto') => (s: { id: string; public_key: string; name: string; lat: number | null; lng: number | null; dist_m: number; items_count: number }) => ({
    kind, id: s.id, key: s.public_key, name: s.name, lat: s.lat, lng: s.lng, dist_m: s.dist_m, items_count: s.items_count,
  });
  const plats = listShopsNearby('plat_maison', lat, lng, radius).map(map('plat'));
  const restos = listShopsNearby('eat', lat, lng, radius).map(map('resto'));
  const items = [...plats, ...restos].sort((a, b) => a.dist_m - b.dist_m);

  return NextResponse.json({ ok: true, center: { lat, lng }, radius, count: items.length, items });
}
