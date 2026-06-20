import 'server-only';

/**
 * Talk2Me — BASE DÉDIÉE DES ANNONCES (Pascal 2026-06-20, chantier « détache tout »).
 *
 * Les Petites annonces ont leur PROPRE base SQLite (`annonces.db`), connexion
 * séparée de la base principale — AUCUN JOIN inter-base. Les liens vers
 * `users` / boutiques se résolvent par ID côté app (pas en SQL), ce qui rend la
 * base réellement extractible (déménageable seule, comme shop.db).
 *
 * Path : env `TALKTOME_ANNONCES_DB_PATH`, sinon `annonces.db` à côté de la base
 * principale. Migration one-time : si `deposit_annonces` est encore dans la base
 * principale, on la rapatrie via ATTACH puis on la supprime → une seule source.
 */
import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

function mainDbPath(): string {
  return process.env.TALKTOME_DB_PATH || process.cwd() + '/data/talktome.db';
}

export function getAnnoncesDb(): Database.Database {
  if (db) return db;
  const p = process.env.TALKTOME_ANNONCES_DB_PATH || path.join(path.dirname(mainDbPath()), 'annonces.db');
  db = new Database(p);
  db.pragma('journal_mode = WAL');

  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deposit_annonces'").get();
  if (!hasTable) {
    let migrated = false;
    try {
      const mp = mainDbPath();
      const probe = new Database(mp, { readonly: true });
      const existsInMain = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deposit_annonces'").get();
      probe.close();
      if (existsInMain) {
        db.exec(`ATTACH DATABASE '${mp.replace(/'/g, "''")}' AS main_db;`);
        db.exec(`CREATE TABLE deposit_annonces AS SELECT * FROM main_db.deposit_annonces;`);
        db.exec(`DETACH DATABASE main_db;`);
        migrated = true;
      }
    } catch { /* base principale absente/verrouillée → on crée vide */ }

    if (!migrated) {
      db.exec(`CREATE TABLE IF NOT EXISTS deposit_annonces (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, shop_id TEXT,
        title TEXT NOT NULL, description TEXT, category TEXT NOT NULL,
        price_cents INTEGER, city TEXT, image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        lat REAL, lng REAL
      );`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_deposit_annonces_user ON deposit_annonces(user_id, updated_at DESC);
             CREATE INDEX IF NOT EXISTS idx_deposit_annonces_pub ON deposit_annonces(status, created_at DESC);`);

    // Une seule source : supprime la copie restée dans la base principale.
    try {
      const main = new Database(mainDbPath());
      const stillThere = main.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deposit_annonces'").get();
      if (stillThere) main.exec('DROP TABLE deposit_annonces;');
      main.close();
    } catch { /* best-effort */ }
  }
  // Colonnes géoloc idempotentes (au cas où la copie migrée serait ancienne).
  for (const c of ['ALTER TABLE deposit_annonces ADD COLUMN lat REAL', 'ALTER TABLE deposit_annonces ADD COLUMN lng REAL']) {
    try { db.exec(c); } catch { /* déjà */ }
  }
  return db;
}
