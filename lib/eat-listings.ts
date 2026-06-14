'use server-only';

/**
 * Talk2Me — MAGASINS À REVENDIQUER (Pascal 2026-06-10).
 * On récupère les vrais restos du quartier (OSM/Overpass) + leur devanture
 * (Mapillary), on les STOCKE en base comme fiches « à revendiquer ». Un sync
 * détecte les magasins qui DISPARAISSENT d'OSM → alerte Telegram + marquage
 * « fermé ». Quand un proprio revendique, la fiche devient une vraie fiche Eat.
 *
 * ⚠️ Fiches INTERNES claimables (pas des pages publiques indexées) — pas de
 * risque SEO type AirBizness. Données publiques OSM uniquement.
 */

import { getDb } from '@/lib/db';
import { notifyTelegram } from '@/lib/ai-ops/telegram';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS eat_listings (
      osm_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cuisine TEXT,
      emoji TEXT,
      address TEXT,
      phone TEXT,
      opening_hours TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      photo_url TEXT,
      area_key TEXT,
      status TEXT NOT NULL DEFAULT 'unclaimed',  -- 'unclaimed' | 'claimed' | 'gone'
      claimed_by TEXT,
      claimed_shop_id TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      gone_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_eatlist_area ON eat_listings(area_key, status);
    CREATE INDEX IF NOT EXISTS idx_eatlist_geo ON eat_listings(lat, lng);
  `);
  ensured = true;
}

export interface EatListing {
  osm_id: string; name: string; cuisine: string | null; emoji: string | null;
  address: string | null; phone: string | null; opening_hours: string | null;
  lat: number; lng: number; photo_url: string | null; status: string;
  claimed_by: string | null; claimed_shop_id: string | null;
}

interface RawPlace { id: string; name: string; lat: number; lng: number; cuisine: string | null; emoji: string; address: string | null; phone: string | null; opening_hours: string | null; photo: string | null }

const CUISINE_EMOJI: Record<string, string> = {
  pizza: '🍕', burger: '🍔', kebab: '🥙', sushi: '🍣', japanese: '🍣', chinese: '🥡',
  italian: '🍝', french: '🍽️', indian: '🍛', thai: '🍜', mexican: '🌮', coffee_shop: '☕',
  bakery: '🥐', sandwich: '🥪', chicken: '🍗', seafood: '🦐', vegetarian: '🥗', regional: '🍲',
};
function emojiFor(amenity: string, cuisine?: string | null): string {
  if (cuisine) { const c = cuisine.split(';')[0].trim().toLowerCase(); if (CUISINE_EMOJI[c]) return CUISINE_EMOJI[c]; }
  if (amenity === 'cafe') return '☕';
  if (amenity === 'fast_food') return '🍔';
  return '🍽️';
}

// Cellule de zone (~1 km) pour scoper la détection de disparition.
export function areaKeyOf(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Récupère les restos d'une zone : OSM (Overpass) + devanture Mapillary. */
export async function fetchAreaPlaces(lat: number, lng: number, radius: number): Promise<RawPlace[]> {
  const query = `[out:json][timeout:20];(node["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:${radius},${lat},${lng}););out body 60;`;
  let places: RawPlace[] = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Talk2Me/1.0 (eat discovery)' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return [];
    const data = (await r.json()) as { elements?: { id: number; lat: number; lon: number; tags?: Record<string, string> }[] };
    places = (data.elements || [])
      .filter((e) => e.tags?.name && Number.isFinite(e.lat) && Number.isFinite(e.lon))
      .map((e) => ({
        id: 'osm-' + e.id, name: e.tags!.name, lat: e.lat, lng: e.lon,
        cuisine: e.tags!.cuisine || null,
        emoji: emojiFor(e.tags!.amenity || 'restaurant', e.tags!.cuisine),
        address: [e.tags!['addr:housenumber'], e.tags!['addr:street']].filter(Boolean).join(' ') || null,
        phone: e.tags!.phone || e.tags!['contact:phone'] || null,
        opening_hours: e.tags!.opening_hours || null,
        photo: null,
      }))
      .slice(0, 60);
  } catch { return []; }

  // Devanture Mapillary (1 requête bbox → image la + proche ≤ 45 m).
  const token = process.env.MAPILLARY_TOKEN;
  if (token && places.length) {
    try {
      const dLat = radius / 111000, dLng = radius / (111000 * Math.cos((lat * Math.PI) / 180));
      const bbox = `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
      const mc = new AbortController();
      const mt = setTimeout(() => mc.abort(), 12000);
      const mr = await fetch(`https://graph.mapillary.com/images?access_token=${token}&fields=thumb_1024_url,computed_geometry,geometry&bbox=${bbox}&limit=500`, { signal: mc.signal });
      clearTimeout(mt);
      if (mr.ok) {
        const mj = (await mr.json()) as { data?: { thumb_1024_url?: string; computed_geometry?: { coordinates: [number, number] }; geometry?: { coordinates: [number, number] } }[] };
        const imgs = (mj.data || []).map((i) => {
          const g = i.computed_geometry?.coordinates || i.geometry?.coordinates;
          return g && i.thumb_1024_url ? { lng: g[0], lat: g[1], url: i.thumb_1024_url } : null;
        }).filter((x): x is { lng: number; lat: number; url: string } => !!x);
        const m2 = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
          const dy = (a.lat - b.lat) * 111000, dx = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);
          return dx * dx + dy * dy;
        };
        for (const p of places) {
          let best: string | null = null, bestD = 45 * 45;
          for (const im of imgs) { const dd = m2(p, im); if (dd < bestD) { bestD = dd; best = im.url; } }
          if (best) p.photo = best;
        }
      }
    } catch { /* Mapillary indispo → fiches sans photo */ }
  }
  return places;
}

/**
 * Sync une zone : upsert les restos vus, détecte les DISPARUS (présents en base
 * pour cette zone mais plus dans OSM), les marque « gone » + alerte Telegram.
 */
export async function syncArea(lat: number, lng: number, radius = 1200): Promise<{ seen: number; created: number; gone: number }> {
  ensure();
  const area = areaKeyOf(lat, lng);
  const now = Date.now();
  const places = await fetchAreaPlaces(lat, lng, radius);
  if (!places.length) return { seen: 0, created: 0, gone: 0 }; // OSM muet → on ne touche à rien

  const db = getDb();
  const seenIds = new Set(places.map((p) => p.id));
  let created = 0;
  const upsert = db.prepare(`
    INSERT INTO eat_listings (osm_id, name, cuisine, emoji, address, phone, opening_hours, lat, lng, photo_url, area_key, status, first_seen, last_seen)
    VALUES (@id, @name, @cuisine, @emoji, @address, @phone, @opening_hours, @lat, @lng, @photo, @area, 'unclaimed', @now, @now)
    ON CONFLICT(osm_id) DO UPDATE SET name=excluded.name, cuisine=excluded.cuisine, emoji=excluded.emoji,
      address=excluded.address, phone=excluded.phone, opening_hours=excluded.opening_hours,
      lat=excluded.lat, lng=excluded.lng, area_key=excluded.area_key, last_seen=@now,
      photo_url=COALESCE(excluded.photo_url, eat_listings.photo_url),
      status=CASE WHEN eat_listings.status='gone' THEN 'unclaimed' ELSE eat_listings.status END,
      gone_at=CASE WHEN eat_listings.status='gone' THEN NULL ELSE eat_listings.gone_at END
  `);
  const tx = db.transaction(() => {
    for (const p of places) {
      const existed = db.prepare('SELECT 1 FROM eat_listings WHERE osm_id = ?').get(p.id);
      if (!existed) created++;
      upsert.run({ id: p.id, name: p.name.slice(0, 120), cuisine: p.cuisine, emoji: p.emoji, address: p.address, phone: p.phone, opening_hours: p.opening_hours, lat: p.lat, lng: p.lng, photo: p.photo, area: area, now });
    }
  });
  tx();

  // Disparitions : fiches de CETTE zone, non revendiquées, pas vues ce sync.
  const candidates = db.prepare("SELECT osm_id, name FROM eat_listings WHERE area_key = ? AND status = 'unclaimed' AND last_seen < ?").all(area, now) as { osm_id: string; name: string }[];
  const gone = candidates.filter((c) => !seenIds.has(c.osm_id));
  if (gone.length) {
    const mark = db.prepare("UPDATE eat_listings SET status='gone', gone_at=? WHERE osm_id=?");
    const tx2 = db.transaction(() => { for (const g of gone) mark.run(now, g.osm_id); });
    tx2();
    notifyTelegram(`🍴 Eat — ${gone.length} magasin(s) disparu(s) d'OSM (zone ${area}) : ${gone.slice(0, 8).map((g) => g.name).join(', ')}${gone.length > 8 ? '…' : ''}. Marqués « fermé », à vérifier/supprimer.`);
  }
  if (created > 0) {
    notifyTelegram(`🍴 Eat — ${created} nouveau(x) resto(s) découvert(s) à revendiquer (zone ${area}).`);
  }

  // Resto REVENDIQUÉ disparu d'OSM → alerte renforcée (un partenaire a peut-être
  // fermé). On NE touche PAS son statut (sa fiche Eat lui appartient) — juste alerte.
  const claimedRows = db.prepare("SELECT osm_id, name, last_seen FROM eat_listings WHERE area_key = ? AND status = 'claimed'").all(area) as { osm_id: string; name: string; last_seen: number }[];
  const claimedGone = claimedRows.filter((c) => c.last_seen < now && !seenIds.has(c.osm_id));
  if (claimedGone.length) {
    notifyTelegram(`⚠️ Eat — ${claimedGone.length} resto(s) REVENDIQUÉ(S) disparu(s) d'OSM (zone ${area}) : ${claimedGone.map((c) => c.name).join(', ')}. À VÉRIFIER (partenaire fermé ?) — efface la fiche depuis l'admin si besoin.`);
  }

  return { seen: places.length, created, gone: gone.length };
}

/** Admin : liste les fiches (optionnellement filtrées par statut), récentes d'abord. */
export function listAllListings(status?: string, limit = 300): (EatListing & { area_key: string; last_seen: number; gone_at: number | null })[] {
  ensure();
  const base = 'SELECT * FROM eat_listings';
  const rows = status
    ? getDb().prepare(base + ' WHERE status = ? ORDER BY last_seen DESC LIMIT ?').all(status, limit)
    : getDb().prepare(base + ' ORDER BY last_seen DESC LIMIT ?').all(limit);
  return rows as (EatListing & { area_key: string; last_seen: number; gone_at: number | null })[];
}

/** Admin : compte par statut. */
export function countByStatus(): Record<string, number> {
  ensure();
  const rows = getDb().prepare('SELECT status, COUNT(*) c FROM eat_listings GROUP BY status').all() as { status: string; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

/** Admin : efface définitivement une fiche (jamais auto — seulement à la main). */
export function deleteListing(osmId: string): boolean {
  ensure();
  return getDb().prepare('DELETE FROM eat_listings WHERE osm_id = ?').run(osmId).changes > 0;
}

/** Fiches à revendiquer autour d'un point (non revendiquées, non disparues). */
export function listClaimable(lat: number, lng: number, radius = 1500): (EatListing & { distance_m: number })[] {
  ensure();
  const dLat = radius / 111000, dLng = radius / (111000 * Math.cos((lat * Math.PI) / 180));
  const rows = getDb().prepare(
    `SELECT * FROM eat_listings WHERE status = 'unclaimed'
       AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
  ).all(lat - dLat, lat + dLat, lng - dLng, lng + dLng) as EatListing[];
  return rows
    .map((r) => {
      const dy = (lat - r.lat) * 111000, dx = (lng - r.lng) * 111000 * Math.cos((lat * Math.PI) / 180);
      return { ...r, distance_m: Math.round(Math.sqrt(dx * dx + dy * dy)) };
    })
    .filter((r) => r.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 40);
}

/** Dernier sync d'une zone (max last_seen) — pour throttler les appels OSM. */
export function areaLastSync(area: string): number | null {
  ensure();
  const r = getDb().prepare('SELECT MAX(last_seen) AS m FROM eat_listings WHERE area_key = ?').get(area) as { m: number | null };
  return r?.m ?? null;
}

export function getListing(osmId: string): EatListing | null {
  ensure();
  return (getDb().prepare('SELECT * FROM eat_listings WHERE osm_id = ?').get(osmId) as EatListing) || null;
}

/** Marque une fiche comme revendiquée (liée à la vraie boutique Eat créée). */
export function markClaimed(osmId: string, userId: string, shopId: string): void {
  ensure();
  getDb().prepare("UPDATE eat_listings SET status='claimed', claimed_by=?, claimed_shop_id=? WHERE osm_id=?").run(userId, shopId, osmId);
}
