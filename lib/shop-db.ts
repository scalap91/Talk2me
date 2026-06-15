'use server-only';

/**
 * Talk2Me — BASE DÉDIÉE DU SHOP (Pascal 2026-06-15, chantier portabilité).
 *
 * Objectif : pouvoir DÉMÉNAGER le catalogue Shop sur un autre serveur/disque
 * SANS toucher au reste. Le Shop a donc sa PROPRE base SQLite (`shop.db`),
 * connexion séparée de la base principale — AUCUN JOIN inter-base. Les liens
 * vers `users`/`boutiques` se font par ID (résolus côté app, pas en SQL), ce qui
 * rend la base réellement extractible (cross-serveur).
 *
 * Path : env `TALKTOME_SHOP_DB_PATH`, sinon `shop.db` à côté de la base principale.
 * Migration one-time : si `shop_products` existe encore dans la base principale
 * (séparation #1), on la rapatrie ici via ATTACH puis on la supprime de la
 * principale → une seule source de vérité.
 */

import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

function mainDbPath(): string {
  return process.env.TALKTOME_DB_PATH || '/home/ubuntu/talktome/data/talktome.db';
}

export function getShopDb(): Database.Database {
  if (db) return db;
  const shopPath = process.env.TALKTOME_SHOP_DB_PATH || path.join(path.dirname(mainDbPath()), 'shop.db');
  db = new Database(shopPath);
  db.pragma('journal_mode = WAL');

  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shop_products'").get();
  if (!hasTable) {
    // Rapatriement depuis la base principale si la table y est encore (séparation #1).
    let migrated = false;
    try {
      const mp = mainDbPath();
      const probe = new Database(mp, { readonly: true });
      const existsInMain = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shop_products'").get();
      probe.close();
      if (existsInMain) {
        db.exec(`ATTACH DATABASE '${mp.replace(/'/g, "''")}' AS main_db;`);
        db.exec(`CREATE TABLE shop_products AS SELECT * FROM main_db.shop_products;`);
        db.exec(`DETACH DATABASE main_db;`);
        migrated = true;
      }
    } catch { /* base principale absente/verrouillée → on crée vide ci-dessous */ }

    if (!migrated) {
      // Schéma minimal (miroir des colonnes utilisées de direct_cards) si pas de source.
      db.exec(`CREATE TABLE IF NOT EXISTS shop_products (
        id TEXT PRIMARY KEY, user_id TEXT, type TEXT, media_url TEXT, caption TEXT, text TEXT,
        bg_variant TEXT, created_at INTEGER, likes INTEGER, views INTEGER, archived_at INTEGER,
        deleted_at INTEGER, share_count INTEGER, save_count INTEGER, comment_count INTEGER,
        order_position INTEGER, metadata_map TEXT, attached_audio_json TEXT, attached_product_json TEXT,
        boosted_until INTEGER, boutique_id TEXT, category TEXT, ad_listed_at INTEGER, ad_city TEXT
      );`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shopprod_boutique ON shop_products(boutique_id);
             CREATE INDEX IF NOT EXISTS idx_shopprod_cat ON shop_products(category);
             CREATE INDEX IF NOT EXISTS idx_shopprod_ad ON shop_products(ad_listed_at);`);

    // Supprimer la copie restée dans la base principale (une seule source de vérité).
    try {
      const main = new Database(mainDbPath());
      const stillThere = main.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shop_products'").get();
      if (stillThere) main.exec('DROP TABLE shop_products;');
      main.close();
    } catch { /* best-effort */ }
  }
  return db;
}
