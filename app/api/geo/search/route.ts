/**
 * Talk2Me — RECHERCHE D'ADRESSE (géocodeur unifié, multi-pays). GET ?q=&lat=&lng=
 * La clé du provider reste CÔTÉ SERVEUR (jamais dans l'app) → on peut changer de provider sans
 * re-livrer l'app. MULTI-PAYS : on déduit le pays de la position (reverse-geocode) et on RESTREINT
 * la recherche à ce pays (corrige « il m'envoie dans un autre pays »).
 *  - Si GOOGLE_MAPS_API_KEY est défini → Google Geocoding (components=country:<cc>) = qualité max.
 *  - Sinon → repli Nominatim (OpenStreetMap) countrycodes=<cc> + viewbox proximité (gratuit).
 * Réponse normalisée : { ok, source, country, results:[{label,lat,lng}] } (même forme pour l'app).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Talk2Me-Geo/1.0 (+https://genius-web.fr/talktome)';

/** Pays de la position (ISO2 minuscule) via reverse Nominatim — gratuit, sans clé. */
async function countryOf(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=3&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = await r.json();
    const cc = String(j?.address?.country_code || '').toLowerCase();
    return cc || null;
  } catch { return null; }
}

async function google(q: string, lat: number, lng: number, cc: string | null, key: string) {
  const params = new URLSearchParams({ address: q, key, language: 'fr' });
  if (cc) params.set('components', `country:${cc}`);           // filtre PAYS dur
  params.set('bounds', `${lat - 0.6},${lng - 0.6}|${lat + 0.6},${lng + 0.6}`); // biais proximité
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(9000) });
  const j = await r.json();
  if (j.status !== 'OK' || !Array.isArray(j.results)) return [];
  return j.results.slice(0, 8).map((x: { formatted_address?: string; geometry?: { location?: { lat: number; lng: number } } }) => ({
    label: x.formatted_address || '', lat: x.geometry?.location?.lat ?? 0, lng: x.geometry?.location?.lng ?? 0,
  })).filter((r: { lat: number; lng: number }) => r.lat && r.lng);
}

async function nominatim(q: string, lat: number, lng: number, cc: string | null) {
  const vb = `${lng - 0.8},${lat + 0.8},${lng + 0.8},${lat - 0.8}`;
  const params = new URLSearchParams({ format: 'json', limit: '8', q, viewbox: vb });
  if (cc) params.set('countrycodes', cc);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) return [];
  const l = await r.json();
  return (l as Array<{ display_name?: string; lat?: string; lon?: string }>).map((e) => ({
    label: e.display_name || '', lat: Number(e.lat) || 0, lng: Number(e.lon) || 0,
  })).filter((r) => r.lat && r.lng);
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  if (!q || !Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ ok: true, results: [] });
  const cc = await countryOf(lat, lng);
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  let results: { label: string; lat: number; lng: number }[] = [];
  let source = 'osm';
  if (key) {
    try { results = await google(q, lat, lng, cc, key); source = 'google'; } catch { /* repli */ }
  }
  if (results.length === 0) { results = await nominatim(q, lat, lng, cc); source = key ? 'osm_fallback' : 'osm'; }
  return NextResponse.json({ ok: true, source, country: cc, results });
}
