/**
 * Talk2Me — Monde 3D : contours des bâtiments (OSM/Overpass) pour planter le décor.
 * GET ?lat=&lng=&r=  → { origin, buildings:[{ id, pts:[{lat,lng}], height, name }] }
 * Gratuit, sans clé. Cache mémoire 1 h par zone (respecte les limites Overpass).
 * Les contours sont convertis en mètres côté client via lib/world/geo-anchor.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

type Bld = { id: number; pts: { lat: number; lng: number }[]; height: number; name?: string };
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 3600_000;

function heightOf(tags: Record<string, string> = {}): number {
  if (tags.height) { const h = parseFloat(tags.height); if (isFinite(h) && h > 0) return h; }
  if (tags['building:levels']) { const l = parseFloat(tags['building:levels']); if (isFinite(l) && l > 0) return l * 3; }
  return 7; // défaut Madagascar (pas de hauteur en OSM) — ~2 niveaux
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') || '-18.9100');
  const lng = parseFloat(sp.get('lng') || '47.5256');
  const r = Math.min(1200, Math.max(100, parseInt(sp.get('r') || '450', 10)));
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${r}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  const dLat = r / 110540;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${(lat - dLat).toFixed(6)},${(lng - dLng).toFixed(6)},${(lat + dLat).toFixed(6)},${(lng + dLng).toFixed(6)}`;
  const q = `[out:json][timeout:25];(way["building"](${bbox}););out geom;`;

  let elements: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const ep of MIRRORS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(25000),
      });
      const txt = await res.text();
      if (!txt.trim().startsWith('{')) continue;
      elements = JSON.parse(txt).elements || [];
      if (elements.length) break;
    } catch { /* mirror suivant */ }
  }

  const buildings: Bld[] = elements
    .filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4)
    .map((e) => ({
      id: e.id,
      pts: e.geometry.map((g: { lat: number; lon: number }) => ({ lat: g.lat, lng: g.lon })),
      height: heightOf(e.tags),
      name: e.tags?.name,
    }));

  const data = { ok: true, origin: { lat, lng }, count: buildings.length, buildings };
  cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data);
}
