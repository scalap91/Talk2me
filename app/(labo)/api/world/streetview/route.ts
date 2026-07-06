/**
 * Talk2Me — Monde 3D : imagerie de rue Mapillary (vraies façades, licence ouverte).
 * GET ?lat=&lng=&r= → { configured, images:[{ id, lat, lng, url }] }
 * Sert à texturer les façades rue par rue. Gated sur MAPILLARY_TOKEN (gratuit) :
 * sans token → configured:false → la scène garde les textures procédurales (repli).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 3600_000;

export async function GET(req: NextRequest) {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return NextResponse.json({ ok: true, configured: false, images: [] });

  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') || '-18.9100');
  const lng = parseFloat(sp.get('lng') || '47.5256');
  const r = Math.min(1200, Math.max(100, parseInt(sp.get('r') || '450', 10)));
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${r}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  const dLat = r / 110540;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  // Mapillary bbox = ouest,sud,est,nord (minLng,minLat,maxLng,maxLat)
  const bbox = `${(lng - dLng).toFixed(6)},${(lat - dLat).toFixed(6)},${(lng + dLng).toFixed(6)},${(lat + dLat).toFixed(6)}`;

  let images: { id: string; lat: number; lng: number; url: string }[] = [];
  try {
    const u = `https://graph.mapillary.com/images?access_token=${token}&fields=id,thumb_1024_url,computed_geometry,geometry&bbox=${bbox}&limit=500`;
    const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const j = (await res.json()) as { data?: { id: string; thumb_1024_url?: string; computed_geometry?: { coordinates: [number, number] }; geometry?: { coordinates: [number, number] } }[] };
      images = (j.data || [])
        .map((i) => {
          const g = i.computed_geometry?.coordinates || i.geometry?.coordinates;
          return g && i.thumb_1024_url ? { id: i.id, lng: g[0], lat: g[1], url: i.thumb_1024_url } : null;
        })
        .filter(Boolean) as typeof images;
    }
  } catch { /* repli : aucune image */ }

  const data = { ok: true, configured: true, count: images.length, images };
  cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data);
}
