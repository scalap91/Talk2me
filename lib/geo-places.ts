/**
 * Base LOCALE des villes de Madagascar (GeoNames, table mg_places dans data/geo.db).
 * Autocomplétion ville hors-ligne + lat/lng prêtes pour le router OSRM (calcul du prix).
 * Import/rafraîchissement : `node scripts/import-geonames-mg.mjs`.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export interface CitySuggestion {
  id: number;
  name: string;
  region: string | null;
  lat: number;
  lng: number;
  population: number;
}

function geoDbPath(): string {
  if (process.env.TALKTOME_GEO_DB_PATH) return process.env.TALKTOME_GEO_DB_PATH;
  const main = process.env.TALKTOME_DB_PATH || path.join(process.cwd(), 'data', 'talktome.db');
  return path.join(path.dirname(main), 'geo.db');
}

let _db: Database.Database | null = null;
function db(): Database.Database | null {
  if (_db) return _db;
  const p = geoDbPath();
  if (!fs.existsSync(p)) return null; // base pas encore importée → on dégrade proprement
  try {
    _db = new Database(p, { readonly: true, fileMustExist: true });
    _db.pragma('busy_timeout = 3000');
    return _db;
  } catch {
    return null;
  }
}

/** Retire les accents et met en minuscule (aligné sur l'import). */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Suggestions de villes pour la saisie. Préfixe d'abord (le plus pertinent), puis
 * complété par des correspondances « contient » si peu de résultats. Tri population.
 */
export function searchCities(query: string, limit = 8): CitySuggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const d = db();
  if (!d) return [];
  const lim = Math.min(Math.max(limit, 1), 15);
  const map = (r: Record<string, unknown>): CitySuggestion => ({
    id: r.geonameid as number,
    name: r.name as string,
    region: (r.region as string | null) ?? null,
    lat: r.lat as number,
    lng: r.lng as number,
    population: (r.population as number) ?? 0,
  });

  const prefix = d
    .prepare('SELECT geonameid,name,region,lat,lng,population FROM mg_places WHERE ascii_lc LIKE ? ORDER BY population DESC, name ASC LIMIT ?')
    .all(q + '%', lim)
    .map(map);
  if (prefix.length >= lim) return prefix;

  // Complément « contient » sur le nom OU un nom alternatif : « tana »→Antananarivo,
  // « majunga »→Mahajanga, « tuléar »→Toliara, « diego »→Antsiranana, « tamatave »→Toamasina.
  const seen = new Set(prefix.map((c) => c.id));
  const contains = d
    .prepare('SELECT geonameid,name,region,lat,lng,population FROM mg_places WHERE (ascii_lc LIKE ? OR alt_lc LIKE ?) AND ascii_lc NOT LIKE ? ORDER BY population DESC, name ASC LIMIT ?')
    .all('%' + q + '%', '%' + q + '%', q + '%', lim)
    .map(map)
    .filter((c) => !seen.has(c.id));
  return [...prefix, ...contains].slice(0, lim);
}
