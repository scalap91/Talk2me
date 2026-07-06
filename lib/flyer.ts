import 'server-only';

/**
 * Talk2Me — Tracking des scans du prospectus (QR unique, Pascal 2026-07-01).
 * 1 QR → landing /f → on capte OÙ le scan a lieu (géoloc précise si accordée, sinon
 * ville via IP). Zéro invention de position (doctrine géoloc). Sert à cartographier
 * où T2M se répand, région par région (les compteurs = capteur).
 */
import { getDb } from '@/lib/db-core';
import { randomUUID } from 'crypto';

let _ready = false;
function ensure() {
  if (_ready) return;
  try {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS flyer_scans (
        id TEXT PRIMARY KEY,
        code TEXT,
        lat REAL, lng REAL, accuracy REAL,
        city TEXT, region TEXT, country TEXT,
        source TEXT,               -- 'geoloc' | 'ip'
        signed_up INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flyer_created ON flyer_scans(created_at DESC);
    `);
  } catch { /* */ }
  _ready = true;
}

export interface FlyerScanInput {
  code?: string | null;
  lat?: number | null; lng?: number | null; accuracy?: number | null;
  city?: string | null; region?: string | null; country?: string | null;
  source: 'geoloc' | 'ip';
}

export function recordFlyerScan(s: FlyerScanInput): string {
  ensure();
  const id = randomUUID();
  getDb().prepare(
    `INSERT INTO flyer_scans (id, code, lat, lng, accuracy, city, region, country, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, s.code ?? 'flyer',
    s.lat ?? null, s.lng ?? null, s.accuracy ?? null,
    s.city ?? null, s.region ?? null, s.country ?? null,
    s.source, Date.now()
  );
  return id;
}

/** Agrégats pour l'admin : total + répartition par ville. */
export function flyerStats(): { total: number; geoloc: number; byCity: { city: string; n: number }[] } {
  ensure();
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) c FROM flyer_scans').get() as { c: number }).c;
  const geoloc = (db.prepare("SELECT COUNT(*) c FROM flyer_scans WHERE source='geoloc'").get() as { c: number }).c;
  const byCity = db.prepare(
    "SELECT COALESCE(city,'(inconnu)') city, COUNT(*) n FROM flyer_scans GROUP BY city ORDER BY n DESC LIMIT 40"
  ).all() as { city: string; n: number }[];
  return { total, geoloc, byCity };
}

/** Points géolocalisés (lat/lng) pour la carte. */
export function flyerPoints(limit = 1000): { lat: number; lng: number; city: string | null; at: number }[] {
  ensure();
  return getDb().prepare(
    'SELECT lat, lng, city, created_at at FROM flyer_scans WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as { lat: number; lng: number; city: string | null; at: number }[];
}
