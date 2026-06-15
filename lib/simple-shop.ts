'use server-only';

/**
 * Talk2Me — Commerces locaux du particulier (Pascal 2026-06-09).
 * Le commerçant met SES photos, chacune a un PRIX, paiement via Wallet T2M.
 *
 * SÉPARATION #2 (Pascal 2026-06-15, doctrine « ON NE MÉLANGE PAS ») : les 3
 * domaines vivent désormais dans des TABLES SÉPARÉES, plus dans une seule table
 * `simple_shops` discriminée par `kind` :
 *   - eat        → eat_shops      + eat_items
 *   - plat_maison→ plats_maison   + plat_items
 *   - boutique   → boutiques_perso+ boutique_items
 * Les 3 ont une structure identique → on route par helper (shopT/itemT) plutôt
 * que de tripler le CRUD. L'API publique du module est INCHANGÉE.
 * La grande boutique dropship Shop CJ est encore ailleurs (shop_products).
 */

import { randomUUID, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';

type Kind = 'boutique' | 'eat' | 'plat_maison';
const ALL_SHOP = ['eat_shops', 'plats_maison', 'boutiques_perso'] as const;
const ALL_ITEM = ['eat_items', 'plat_items', 'boutique_items'] as const;
const SHOP_T: Record<string, string> = { eat: 'eat_shops', plat_maison: 'plats_maison', boutique: 'boutiques_perso' };
const ITEM_T: Record<string, string> = { eat: 'eat_items', plat_maison: 'plat_items', boutique: 'boutique_items' };
const shopT = (kind?: string | null) => SHOP_T[kind || 'boutique'] || 'boutiques_perso';
const itemT = (kind?: string | null) => ITEM_T[kind || 'boutique'] || 'boutique_items';
const unionSelect = (tables: readonly string[], where: string) =>
  tables.map((t) => `SELECT * FROM ${t} WHERE ${where}`).join(' UNION ALL ');

let ensured = false;
function ensure() {
  if (ensured) return;
  const db = getDb();
  // Tables LEGACY (source de migration ; vidées après séparation). On garde la
  // création + ALTERs pour qu'une base fraîche ait toutes les colonnes à copier.
  db.exec(`
    CREATE TABLE IF NOT EXISTS simple_shops (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
      public_key TEXT UNIQUE NOT NULL, wallet_enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS simple_shop_items (
      id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, image_url TEXT NOT NULL, label TEXT,
      price_cents INTEGER NOT NULL, position INTEGER DEFAULT 0, created_at INTEGER NOT NULL
    );
  `);
  for (const c of [
    'ALTER TABLE simple_shops ADD COLUMN description TEXT', 'ALTER TABLE simple_shops ADD COLUMN category TEXT',
    "ALTER TABLE simple_shops ADD COLUMN kind TEXT DEFAULT 'boutique'", 'ALTER TABLE simple_shops ADD COLUMN lat REAL',
    'ALTER TABLE simple_shops ADD COLUMN lng REAL', 'ALTER TABLE simple_shops ADD COLUMN prep_min INTEGER',
    'ALTER TABLE simple_shops ADD COLUMN cover_url TEXT', 'ALTER TABLE simple_shops ADD COLUMN address TEXT',
    'ALTER TABLE simple_shops ADD COLUMN phone TEXT', 'ALTER TABLE simple_shops ADD COLUMN hours TEXT',
    'ALTER TABLE simple_shops ADD COLUMN service_mode TEXT', 'ALTER TABLE simple_shops ADD COLUMN delivery_fee_cents INTEGER',
    'ALTER TABLE simple_shops ADD COLUMN min_order_cents INTEGER',
    'ALTER TABLE simple_shop_items ADD COLUMN description TEXT', 'ALTER TABLE simple_shop_items ADD COLUMN section TEXT',
  ]) { try { db.exec(c); } catch { /* déjà */ } }

  // Migration séparation #2 : créer les 6 tables (schéma identique) + copier + vider.
  const hasNew = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='eat_shops'").get();
  if (!hasNew) {
    db.exec(`
      CREATE TABLE eat_shops       AS SELECT * FROM simple_shops      WHERE 1=0;
      CREATE TABLE plats_maison    AS SELECT * FROM simple_shops      WHERE 1=0;
      CREATE TABLE boutiques_perso AS SELECT * FROM simple_shops      WHERE 1=0;
      CREATE TABLE eat_items       AS SELECT * FROM simple_shop_items WHERE 1=0;
      CREATE TABLE plat_items      AS SELECT * FROM simple_shop_items WHERE 1=0;
      CREATE TABLE boutique_items  AS SELECT * FROM simple_shop_items WHERE 1=0;
      INSERT INTO eat_shops       SELECT * FROM simple_shops WHERE kind='eat';
      INSERT INTO plats_maison    SELECT * FROM simple_shops WHERE kind='plat_maison';
      INSERT INTO boutiques_perso SELECT * FROM simple_shops WHERE kind='boutique' OR kind IS NULL;
      INSERT INTO eat_items      SELECT i.* FROM simple_shop_items i JOIN simple_shops s ON s.id=i.shop_id WHERE s.kind='eat';
      INSERT INTO plat_items     SELECT i.* FROM simple_shop_items i JOIN simple_shops s ON s.id=i.shop_id WHERE s.kind='plat_maison';
      INSERT INTO boutique_items SELECT i.* FROM simple_shop_items i JOIN simple_shops s ON s.id=i.shop_id WHERE s.kind='boutique' OR s.kind IS NULL;
      DELETE FROM simple_shop_items;
      DELETE FROM simple_shops;
    `);
    for (const t of ALL_SHOP) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_owner ON ${t}(owner_id);
               CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_key ON ${t}(public_key);`);
    }
    for (const t of ALL_ITEM) db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_shop ON ${t}(shop_id);`);
  }
  ensured = true;
}

export interface SimpleShop { id: string; owner_id: string; name: string; description: string | null; category: string | null; kind: string | null; public_key: string; wallet_enabled: number; created_at: number; lat: number | null; lng: number | null; cover_url: string | null; prep_min: number | null; address: string | null; phone: string | null; hours: string | null; service_mode: string | null; delivery_fee_cents: number | null; min_order_cents: number | null }
export interface SimpleItem { id: string; shop_id: string; image_url: string; label: string | null; price_cents: number; position: number; created_at: number; description: string | null; section: string | null }

export function createSimpleShop(ownerId: string, name: string, description?: string, category?: string, kind: Kind = 'boutique', opts?: { lat?: number | null; lng?: number | null; coverUrl?: string | null; prepMin?: number | null; address?: string | null; phone?: string | null; hours?: string | null; serviceMode?: string | null; deliveryFeeCents?: number | null; minOrderCents?: number | null }): SimpleShop {
  ensure();
  const id = randomUUID();
  const key = randomBytes(7).toString('hex');
  const now = Date.now();
  getDb().prepare(`INSERT INTO ${shopT(kind)} (id, owner_id, name, description, category, kind, public_key, wallet_enabled, created_at, lat, lng, cover_url, prep_min, address, phone, hours, service_mode, delivery_fee_cents, min_order_cents) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ownerId, (name || '').trim().slice(0, 80) || (kind === 'eat' ? 'Mon resto' : kind === 'plat_maison' ? 'Mes plats maison' : 'Ma boutique'), (description || '').trim().slice(0, 300) || null, (category || '').trim().slice(0, 40) || (kind === 'eat' ? 'Restaurant' : null), kind, key, now,
      opts?.lat ?? null, opts?.lng ?? null, opts?.coverUrl ?? null, opts?.prepMin ?? null,
      (opts?.address || '').slice(0, 200) || null, (opts?.phone || '').slice(0, 40) || null, (opts?.hours || '').slice(0, 200) || null,
      (opts?.serviceMode || '').slice(0, 60) || null,
      typeof opts?.deliveryFeeCents === 'number' ? opts.deliveryFeeCents : null,
      typeof opts?.minOrderCents === 'number' ? opts.minOrderCents : null);
  return getSimpleShop(id)!;
}

export function getSimpleShop(id: string): SimpleShop | null {
  ensure();
  return (getDb().prepare(unionSelect(ALL_SHOP, 'id = ?')).get(id, id, id) as SimpleShop) || null;
}
export function getSimpleShopByKey(key: string): SimpleShop | null {
  ensure();
  return (getDb().prepare(unionSelect(ALL_SHOP, 'public_key = ?')).get(key, key, key) as SimpleShop) || null;
}
export function listSimpleShops(ownerId: string): SimpleShop[] {
  ensure();
  return getDb().prepare(unionSelect(ALL_SHOP, 'owner_id = ?') + ' ORDER BY created_at DESC').all(ownerId, ownerId, ownerId) as SimpleShop[];
}
export function listItems(shopId: string): SimpleItem[] {
  ensure();
  return getDb().prepare(unionSelect(ALL_ITEM, 'shop_id = ?') + ' ORDER BY position ASC, created_at ASC').all(shopId, shopId, shopId) as SimpleItem[];
}
export function addItem(shopId: string, imageUrl: string, priceCents: number, label?: string | null, extra?: { description?: string | null; section?: string | null }): SimpleItem {
  ensure();
  const shop = getSimpleShop(shopId);
  const table = itemT(shop?.kind);
  const id = randomUUID();
  const now = Date.now();
  const pos = (getDb().prepare(`SELECT COUNT(*) c FROM ${table} WHERE shop_id = ?`).get(shopId) as { c: number }).c;
  getDb().prepare(`INSERT INTO ${table} (id, shop_id, image_url, label, price_cents, position, created_at, description, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, shopId, imageUrl, (label || '').slice(0, 120) || null, Math.max(0, Math.round(priceCents)), pos, now,
      (extra?.description || '').slice(0, 300) || null, (extra?.section || '').slice(0, 40) || null);
  return getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SimpleItem;
}

/** Plats maison à proximité (rayon en mètres) — les voisins connectés les voient. */
export function listPlatMaisonNearby(lat: number, lng: number, radiusM = 500, excludeOwner?: string): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const rows = getDb().prepare('SELECT * FROM plats_maison WHERE lat IS NOT NULL AND lng IS NOT NULL').all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    if (excludeOwner && s.owner_id === excludeOwner) continue;
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (getDb().prepare('SELECT COUNT(*) c FROM plat_items WHERE shop_id = ?').get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 30);
}

/** Commerces d'un kind donné à proximité (rayon en mètres) — pour le RADAR. */
export function listShopsNearby(kind: string, lat: number, lng: number, radiusM = 500): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const rows = getDb().prepare(`SELECT * FROM ${shopT(kind)} WHERE lat IS NOT NULL AND lng IS NOT NULL`).all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (getDb().prepare(`SELECT COUNT(*) c FROM ${itemT(kind)} WHERE shop_id = ?`).get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 40);
}
export function deleteItem(shopId: string, itemId: string): void {
  ensure();
  const db = getDb();
  for (const t of ALL_ITEM) db.prepare(`DELETE FROM ${t} WHERE id = ? AND shop_id = ?`).run(itemId, shopId);
}
/** Remplace la photo d'un article (ex : après nettoyage IA). Pascal 2026-06-11. */
export function updateItemImage(shopId: string, itemId: string, imageUrl: string): SimpleItem | null {
  ensure();
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
  const db = getDb();
  for (const t of ALL_ITEM) db.prepare(`UPDATE ${t} SET image_url = ? WHERE id = ? AND shop_id = ?`).run(imageUrl, itemId, shopId);
  return (db.prepare(unionSelect(ALL_ITEM, 'id = ?')).get(itemId, itemId, itemId) as SimpleItem) || null;
}
export function setWalletEnabled(id: string, ownerId: string, on: boolean): void {
  ensure();
  const db = getDb();
  for (const t of ALL_SHOP) db.prepare(`UPDATE ${t} SET wallet_enabled = ? WHERE id = ? AND owner_id = ?`).run(on ? 1 : 0, id, ownerId);
}
/** Longueur mini d'une description « complète » pour apparaître dans les Petites
 *  annonces (Pascal 2026-06-11 : pas de description complète → pas d'annonce). */
export const MIN_ANNONCE_DESC = 20;
export function isAnnonceReady(description: string | null | undefined): boolean {
  return !!description && description.trim().length >= MIN_ANNONCE_DESC;
}
/** Met à jour la description de la boutique (owner only). */
export function updateShopDescription(id: string, ownerId: string, description: string): SimpleShop | null {
  ensure();
  const db = getDb();
  const desc = (description || '').trim().slice(0, 300) || null;
  for (const t of ALL_SHOP) db.prepare(`UPDATE ${t} SET description = ? WHERE id = ? AND owner_id = ?`).run(desc, id, ownerId);
  return getSimpleShop(id);
}
