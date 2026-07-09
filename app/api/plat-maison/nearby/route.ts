/**
 * GET /api/plat-maison/nearby?lat&lng&radius (Pascal 2026-06-14)
 * Les VOISINS connectés voient les plats faits maison autour d'eux (défaut 500 m).
 * → { ok, plats: [{ id, public_key, name, cover_url, dist_m, items_count }] }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listPlatMaisonNearby } from '@/lib/simple-shop';
import { getOps } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  if (isNaN(lat) || isNaN(lng)) return NextResponse.json({ error: 'position_required' }, { status: 400 });
  // Plats de Mama = HYPER-LOCAL (le quartier). Rayons RÉGLABLES PAR L'ADMIN (Pascal 2026-07-09) :
  // défaut 500 m ; si aucun voisin ne cuisine, on élargit UNE fois jusqu'au max admin (défaut 1 km).
  const baseR = getOps('eat.plat_radius_m');       // 500 m par défaut
  const maxR = getOps('eat.plat_radius_max_m');    // 1 km par défaut
  const reqR = parseInt(url.searchParams.get('radius') || String(baseR), 10);
  const radius = Number.isFinite(reqR) && reqR > 0 ? Math.min(reqR, maxR) : baseR;
  const ladder = [...new Set([radius, maxR].filter((r) => r >= radius))].sort((a, b) => a - b);
  let rows: ReturnType<typeof listPlatMaisonNearby> = [];
  let usedRadius = radius;
  for (const r of ladder) {
    usedRadius = r;
    rows = listPlatMaisonNearby(lat, lng, r);
    if (rows.length) break;
  }
  const plats = rows.map((s) => ({
    id: s.id, public_key: s.public_key, name: s.name, cover_url: s.cover_url,
    dist_m: s.dist_m, items_count: s.items_count, lat: s.lat, lng: s.lng,
  }));
  return NextResponse.json({ ok: true, center: { lat, lng }, radius: usedRadius, plats });
}
