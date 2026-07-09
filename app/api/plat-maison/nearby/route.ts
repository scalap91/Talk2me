/**
 * GET /api/plat-maison/nearby?lat&lng&radius (Pascal 2026-06-14)
 * Les VOISINS connectés voient les plats faits maison autour d'eux (défaut 500 m).
 * → { ok, plats: [{ id, public_key, name, cover_url, dist_m, items_count }] }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listPlatMaisonNearby } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  if (isNaN(lat) || isNaN(lng)) return NextResponse.json({ error: 'position_required' }, { status: 400 });
  let radius = parseInt(url.searchParams.get('radius') || '2000', 10);
  if (isNaN(radius) || radius <= 0) radius = 2000;
  radius = Math.min(radius, 100000); // cap 100 km (Madagascar : faible densité)
  // AUTO-ÉLARGISSEMENT (Audit #64) : si aucun plat au rayon demandé, on élargit progressivement
  // (5 → 20 → 100 km) → un plat en zone peu dense reste TROUVABLE (« j'ai créé un plat, personne
  // ne le voit » réglé). On renvoie le rayon réellement utilisé pour que l'UI l'affiche.
  const ladder = [...new Set([radius, 5000, 20000, 100000].filter((r) => r >= radius))].sort((a, b) => a - b);
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
