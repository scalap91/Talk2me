/**
 * Import GeoNames Madagascar → data/geo.db (table mg_places).
 * Base LOCALE, possédée par Talk2Me : autocomplétion ville hors-ligne + lat/lng pour OSRM.
 * Source : https://download.geonames.org/export/dump/MG.zip (licence CC-BY 4.0).
 *
 * Ré-exécutable : télécharge le dump, ne garde que les lieux peuplés (feature_class 'P'),
 * mappe admin1 → nom de région (admin1CodesASCII.txt), (re)construit la table + index.
 *
 *   node scripts/import-geonames-mg.mjs           # télécharge puis importe
 *   node scripts/import-geonames-mg.mjs /tmp/MG.txt /tmp/admin1CodesASCII.txt  # fichiers locaux
 */
import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const GEO_DB = process.env.TALKTOME_GEO_DB_PATH || path.join(DATA_DIR, 'geo.db');
const TMP = '/tmp/geonames-mg';

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function ensureSources() {
  let mgTxt = process.argv[2];
  let admTxt = process.argv[3];
  if (mgTxt && admTxt) return { mgTxt, admTxt };
  mkdirSync(TMP, { recursive: true });
  console.log('→ Téléchargement MG.zip + admin1CodesASCII.txt…');
  execSync(`curl -s -o ${TMP}/MG.zip "https://download.geonames.org/export/dump/MG.zip"`, { stdio: 'inherit' });
  execSync(`cd ${TMP} && unzip -o MG.zip >/dev/null`, { stdio: 'inherit' });
  execSync(`curl -s -o ${TMP}/admin1CodesASCII.txt "https://download.geonames.org/export/dump/admin1CodesASCII.txt"`, { stdio: 'inherit' });
  return { mgTxt: `${TMP}/MG.txt`, admTxt: `${TMP}/admin1CodesASCII.txt` };
}

function loadRegions(admTxt) {
  const map = new Map(); // "MG.11" → "Analamanga"
  for (const line of readFileSync(admTxt, 'utf8').split('\n')) {
    if (!line.startsWith('MG.')) continue;
    const [code, , name] = line.split('\t');
    if (code && name) map.set(code, name.replace(/ Region$/, '').trim());
  }
  return map;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const { mgTxt, admTxt } = await ensureSources();
  const regions = loadRegions(admTxt);
  console.log(`→ ${regions.size} régions chargées.`);

  const db = new Database(GEO_DB);
  db.pragma('journal_mode = WAL');
  db.exec('DROP TABLE IF EXISTS mg_places;'); // recrée le schéma à chaque import (migrations de colonnes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS mg_places (
      geonameid INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      ascii_lc  TEXT NOT NULL,   -- nom sans accents, minuscule (recherche prefixe)
      alt_lc    TEXT,            -- noms alternatifs (Majunga, Tananarive, Tuléar, Diego…) normalisés
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      admin1    TEXT,
      region    TEXT,
      population INTEGER NOT NULL DEFAULT 0,
      feature_code TEXT
    );
  `);
  db.exec('DELETE FROM mg_places;');
  const ins = db.prepare(
    'INSERT OR REPLACE INTO mg_places (geonameid,name,ascii_lc,alt_lc,lat,lng,admin1,region,population,feature_code) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );

  let n = 0;
  const rows = readFileSync(mgTxt, 'utf8').split('\n');
  const tx = db.transaction(() => {
    for (const line of rows) {
      if (!line) continue;
      const c = line.split('\t');
      if (c[6] !== 'P') continue; // feature_class 'P' = lieu peuplé (ville/village)
      const id = parseInt(c[0], 10);
      const name = c[1];
      const ascii = c[2] || c[1];
      const lat = parseFloat(c[4]);
      const lng = parseFloat(c[5]);
      const admin1 = c[10] ? `MG.${c[10]}` : null;
      const pop = parseInt(c[14] || '0', 10) || 0;
      const code = c[7] || null;
      // Noms alternatifs (col 4, séparés par virgule) : Majunga, Tananarive, Tuléar, Diego, Tamatave…
      const alt = (c[3] || '').split(',').map((a) => stripAccents(a)).filter(Boolean).join(' ');
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) continue;
      ins.run(id, name, stripAccents(ascii), alt || null, lat, lng, admin1, admin1 ? regions.get(admin1) || null : null, pop, code);
      n++;
    }
  });
  tx();

  db.exec('CREATE INDEX IF NOT EXISTS idx_mg_ascii ON mg_places (ascii_lc);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_mg_pop ON mg_places (population DESC);');
  const total = db.prepare('SELECT COUNT(*) c FROM mg_places').get().c;
  db.close();

  console.log(`✓ ${n} lieux importés dans ${GEO_DB} (total table : ${total}).`);
  if (!process.argv[2] && existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error('✗ Import échoué :', e); process.exit(1); });
