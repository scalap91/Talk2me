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
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Talk2Me-Geo/1.0 (+https://genius-web.fr/talktome)';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours (max autorisé par Google + coupe les appels)

type GeoResult = { label: string; lat: number; lng: number };

/** Cache 30 j des recherches (clé = pays|requête normalisée). Réduit fortement les appels API. */
function cacheGet(key: string): GeoResult[] | null {
  try {
    const db = getDb();
    db.exec('CREATE TABLE IF NOT EXISTS geo_cache (key TEXT PRIMARY KEY, results_json TEXT NOT NULL, created_at INTEGER NOT NULL)');
    const r = db.prepare('SELECT results_json, created_at FROM geo_cache WHERE key = ?').get(key) as { results_json: string; created_at: number } | undefined;
    if (!r) return null;
    if (Date.now() - r.created_at > CACHE_TTL_MS) { db.prepare('DELETE FROM geo_cache WHERE key = ?').run(key); return null; }
    return JSON.parse(r.results_json) as GeoResult[];
  } catch { return null; }
}
function cachePut(key: string, results: GeoResult[]): void {
  try {
    if (!results.length) return; // ne cache pas les vides (laisse retenter)
    getDb().prepare('INSERT OR REPLACE INTO geo_cache (key, results_json, created_at) VALUES (?, ?, ?)').run(key, JSON.stringify(results), Date.now());
  } catch { /* cache best-effort */ }
}

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

/** Photon (komoot) — 2e géocodeur OSM, gratuit, sans clé. Ranking différent de Nominatim → on CROISE. */
async function photon(q: string, lat: number, lng: number, cc: string | null): Promise<GeoResult[]> {
  const r = await fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=8&lang=fr`, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) return [];
  const j = await r.json();
  return ((j?.features || []) as Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, string> }>)
    .filter((f) => !cc || String(f.properties?.countrycode || '').toLowerCase() === cc)
    .map((f) => {
      const c = f.geometry?.coordinates || []; const p = f.properties || {};
      const label = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ');
      return { label, lat: Number(c[1]) || 0, lng: Number(c[0]) || 0 };
    }).filter((x) => x.lat && x.lng);
}

/** NOTRE base d'adresses confirmées (grandit au fil des usages, possédée, gratuite). Cherchée EN PREMIER. */
function ensurePlaces() {
  const db = getDb();
  db.exec("CREATE TABLE IF NOT EXISTS geo_places (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, country TEXT, uses INTEGER DEFAULT 1, created_at INTEGER NOT NULL)");
  return db;
}
function baseSearch(q: string, cc: string | null): GeoResult[] {
  try {
    const db = ensurePlaces();
    const rows = db.prepare("SELECT label, lat, lng FROM geo_places WHERE label LIKE ? AND (? IS NULL OR country = ?) ORDER BY uses DESC LIMIT 5")
      .all(`%${q}%`, cc, cc) as GeoResult[];
    return rows;
  } catch { return []; }
}
function addPlace(label: string, lat: number, lng: number, cc: string | null): void {
  try {
    const db = ensurePlaces();
    const ex = db.prepare('SELECT id FROM geo_places WHERE label = ? AND ABS(lat-?)<0.0005 AND ABS(lng-?)<0.0005').get(label, lat, lng) as { id: number } | undefined;
    if (ex) db.prepare('UPDATE geo_places SET uses = uses + 1 WHERE id = ?').run(ex.id);
    else db.prepare('INSERT INTO geo_places (label, lat, lng, country, created_at) VALUES (?,?,?,?,?)').run(label, lat, lng, cc, Date.now());
  } catch { /* best-effort */ }
}

/** Fusionne + déduplique (par proximité ~11 m) plusieurs sources, base d'abord. */
function merge(...lists: GeoResult[][]): GeoResult[] {
  const seen = new Set<string>(); const out: GeoResult[] = [];
  for (const list of lists) for (const r of list) {
    if (!r.label || !r.lat || !r.lng) continue;
    const k = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (seen.has(k)) continue; seen.add(k); out.push(r);
  }
  return out.slice(0, 10);
}

/** POST : enregistre une adresse CONFIRMÉE par l'utilisateur (base T2M qui grossit). {label,lat,lng} */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { label?: string; lat?: number; lng?: number };
  const label = String(b.label || '').trim();
  const lat = Number(b.lat); const lng = Number(b.lng);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  addPlace(label, lat, lng, await countryOf(lat, lng));
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  if (!q || !Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ ok: true, results: [] });
  const cc = await countryOf(lat, lng);
  const ckey = `${cc || '?'}|${q.toLowerCase()}`;
  const cached = cacheGet(ckey);                    // cache 30 j → 0 appel API si déjà vu
  if (cached) return NextResponse.json({ ok: true, source: 'cache', country: cc, results: cached });
  // 1) NOTRE base confirmée d'abord (gratuite, possédée). 2) On CROISE les fournisseurs gratuits
  //    (Nominatim + Photon) en parallèle ; Google seulement si une clé est posée (bonus qualité).
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  const base = baseSearch(q, cc);
  const jobs: Promise<GeoResult[]>[] = [
    nominatim(q, lat, lng, cc).catch(() => []),
    photon(q, lat, lng, cc).catch(() => []),
  ];
  if (key) jobs.push(google(q, lat, lng, cc, key).catch(() => []));
  const settled = await Promise.all(jobs);
  const results = merge(base, ...settled);
  const sources = ['nominatim', 'photon', ...(key ? ['google'] : [])].join('+');
  const source = base.length ? `base+${sources}` : sources;
  cachePut(ckey, results);                           // mémorise 30 j (Google autorise ≤ 30 j)
  return NextResponse.json({ ok: true, source, country: cc, results });
}
