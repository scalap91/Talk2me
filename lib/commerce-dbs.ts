import 'server-only';

/**
 * Talk2Me — 3 BASES MARCHANDES SÉPARÉES (Pascal 2026-06-20, « détache tout »).
 *
 * Chaque domaine a sa PROPRE base SQLite, portable/extractible seule :
 *   - boutique    → boutiques.db (boutiques_perso + boutique_items)
 *   - plat_maison → plats.db     (plats_maison    + plat_items)
 *   - eat         → eat.db       (eat_shops       + eat_items)
 *
 * AUCUN JOIN inter-base : les requêtes cross-kind (lister mes commerces…) se font
 * en interrogeant les 3 connexions et en fusionnant en JS (cf. simple-shop.ts).
 * Migration one-time : copie chaque table depuis talktome.db (ATTACH) puis DROP.
 * Path : env `TALKTOME_COMMERCE_DIR`, sinon à côté de la base principale.
 */
import Database from 'better-sqlite3';
import path from 'path';

export type Kind = 'boutique' | 'eat' | 'plat_maison' | 'service' | 'emploi' | 'rencontre';
const META: Record<Kind, { file: string; shop: string; item: string }> = {
  boutique:    { file: 'boutiques.db', shop: 'boutiques_perso', item: 'boutique_items' },
  plat_maison: { file: 'plats.db',     shop: 'plats_maison',    item: 'plat_items' },
  eat:         { file: 'eat.db',       shop: 'eat_shops',       item: 'eat_items' },
  // Annonces « listing + action chat » — l'enregistrement shop EST l'annonce (pas
  // de produits à acheter). Service → devis, Emploi → candidature, Rencontre → écrire.
  // Bases séparées, schéma commun (SHOP_COLS/ITEM_COLS) : items non utilisés mais table présente.
  service:     { file: 'services.db',  shop: 'services_perso',  item: 'service_items' },
  emploi:      { file: 'emploi.db',    shop: 'emploi_offres',   item: 'emploi_items' },
  // Rencontre (Pascal 2026-07-14) : le shop = un profil (pseudo/bio/photo, pas de prix).
  rencontre:   { file: 'rencontres.db', shop: 'rencontres_perso', item: 'rencontre_items' },
};
export const COMMERCE_KINDS: Kind[] = ['boutique', 'plat_maison', 'eat', 'service', 'emploi', 'rencontre'];
export const shopTable = (k: Kind) => META[k].shop;
export const itemTable = (k: Kind) => META[k].item;

const conns: Partial<Record<Kind, Database.Database>> = {};
function mainDbPath(): string {
  return process.env.TALKTOME_DB_PATH || process.cwd() + '/data/talktome.db';
}
function dir(): string {
  return process.env.TALKTOME_COMMERCE_DIR || path.dirname(mainDbPath());
}

const SHOP_COLS =
  'id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT, description TEXT, category TEXT, kind TEXT, ' +
  'public_key TEXT, wallet_enabled INTEGER DEFAULT 1, created_at INTEGER, lat REAL, lng REAL, cover_url TEXT, ' +
  'prep_min INTEGER, address TEXT, phone TEXT, hours TEXT, service_mode TEXT, delivery_fee_cents INTEGER, min_order_cents INTEGER';
const ITEM_COLS =
  'id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, image_url TEXT, label TEXT, price_cents INTEGER, position INTEGER DEFAULT 0, ' +
  'created_at INTEGER, description TEXT, section TEXT, annonce_on INTEGER DEFAULT 0, annonce_category TEXT, ' +
  'annonce_city TEXT, annonce_lat REAL, annonce_lng REAL, annonce_until INTEGER';
const SHOP_EXTRA = ['category TEXT', 'kind TEXT', 'lat REAL', 'lng REAL', 'prep_min INTEGER', 'cover_url TEXT',
  'address TEXT', 'phone TEXT', 'hours TEXT', 'service_mode TEXT', 'delivery_fee_cents INTEGER', 'min_order_cents INTEGER'];
const ITEM_EXTRA = ['description TEXT', 'section TEXT', 'annonce_on INTEGER DEFAULT 0', 'annonce_category TEXT',
  'annonce_city TEXT', 'annonce_lat REAL', 'annonce_lng REAL', 'annonce_until INTEGER',
  // Talk2Me 2026-06-27 — UN seul type d'annonce : chaque article porte SA catégorie
  // (Mode, Maison, Véhicules…) → la boutique se classe par catégorie. Indépendant
  // de annonce_category (qui n'existe que quand l'article est badgé « Annonce »).
  'category TEXT',
  // 2026-06-28 — détails structurés (JSON) + galerie multi-photos (JSON [url,…])
  // + quantité de stock (NULL = non applicable : emploi, immobilier, service).
  'attributes TEXT', 'photos TEXT', 'quantity INTEGER',
  // Compteur de ventes PUBLIC (Pascal 2026-08-05) : « N vendus » sur la card (social proof).
  // Le nominatif (qui a acheté) reste dans l'escrow, JAMAIS sur la card publique (air-gap PII).
  'sold INTEGER DEFAULT 0',
  // Card OS : le `.card` stocké de l'article (source de vérité, lu par le lecteur Boutique).
  'dotcard TEXT'];

export function commerceDb(kind: Kind): Database.Database {
  if (conns[kind]) return conns[kind]!;
  const m = META[kind];
  const db = new Database(path.join(dir(), m.file));
  db.pragma('journal_mode = WAL');

  const hasShop = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(m.shop);
  if (!hasShop) {
    let migrated = false;
    try {
      const mp = mainDbPath();
      const probe = new Database(mp, { readonly: true });
      const inMain = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(m.shop);
      const itemInMain = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(m.item);
      probe.close();
      if (inMain) {
        db.exec(`ATTACH DATABASE '${mp.replace(/'/g, "''")}' AS main_db;`);
        db.exec(`CREATE TABLE ${m.shop} AS SELECT * FROM main_db.${m.shop};`);
        if (itemInMain) db.exec(`CREATE TABLE ${m.item} AS SELECT * FROM main_db.${m.item};`);
        db.exec('DETACH DATABASE main_db;');
        migrated = true;
      }
    } catch { /* base principale absente/verrouillée */ }
    if (!migrated) db.exec(`CREATE TABLE IF NOT EXISTS ${m.shop} (${SHOP_COLS});`);
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(m.item)) {
      db.exec(`CREATE TABLE ${m.item} (${ITEM_COLS});`);
    }
    // Une seule source : on retire les tables migrées de la base principale.
    try {
      const main = new Database(mainDbPath());
      for (const t of [m.item, m.shop]) {
        if (main.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t)) main.exec(`DROP TABLE ${t};`);
      }
      main.close();
    } catch { /* best-effort */ }
  }
  // Colonnes idempotentes (copie migrée potentiellement ancienne).
  for (const c of SHOP_EXTRA) { try { db.exec(`ALTER TABLE ${m.shop} ADD COLUMN ${c}`); } catch { /* déjà */ } }
  for (const c of ITEM_EXTRA) { try { db.exec(`ALTER TABLE ${m.item} ADD COLUMN ${c}`); } catch { /* déjà */ } }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${m.shop}_owner ON ${m.shop}(owner_id);`);
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${m.shop}_key ON ${m.shop}(public_key);`); } catch { /* */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${m.item}_shop ON ${m.item}(shop_id);`);

  conns[kind] = db;
  return db;
}
