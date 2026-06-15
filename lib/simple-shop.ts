'use server-only';

/**
 * Talk2Me — BOUTIQUE SIMPLE façon WhatsApp Business (Pascal 2026-06-09).
 * Le commerçant met SES photos, chacune a un PRIX. Option paiement via le Wallet
 * T2M. Il décide quand l'envoyer à ses contacts. Pas de catalogue CJ, pas de
 * dropship — ses propres produits. (La grande boutique Shop CJ reste à part.)
 *
 * Module isolé (comme [[project_talk2me_business_inbox]]) : tables créées à la
 * volée, CRUD simple, partageable par lien public.
 */

import { randomUUID, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS simple_shops (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      public_key TEXT UNIQUE NOT NULL,
      wallet_enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sshop_owner ON simple_shops(owner_id);
    CREATE TABLE IF NOT EXISTS simple_shop_items (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      label TEXT,
      price_cents INTEGER NOT NULL,
      position INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sshop_items ON simple_shop_items(shop_id);
  `);
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN description TEXT'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN category TEXT'); } catch { /* déjà */ }
  // Talk2Me Eat (Pascal 2026-06-10) — 'boutique' | 'eat' (resto façon Uber Eats).
  try { getDb().exec("ALTER TABLE simple_shops ADD COLUMN kind TEXT DEFAULT 'boutique'"); } catch { /* déjà */ }
  // Position du resto (pour « restos autour de moi », chauffeur en pause).
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN lat REAL'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN lng REAL'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN prep_min INTEGER'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN cover_url TEXT'); } catch { /* déjà */ }
  // Resto enrichi (Pascal 2026-06-14) : infos enseigne + livraison.
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN address TEXT'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN phone TEXT'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN hours TEXT'); } catch { /* déjà */ }
  try { getDb().exec("ALTER TABLE simple_shops ADD COLUMN service_mode TEXT"); } catch { /* déjà */ } // 'sur_place,emporter,livraison' (csv)
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN delivery_fee_cents INTEGER'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shops ADD COLUMN min_order_cents INTEGER'); } catch { /* déjà */ }
  // Plat / article enrichi : description + section de menu (Entrées/Plats/…).
  try { getDb().exec('ALTER TABLE simple_shop_items ADD COLUMN description TEXT'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE simple_shop_items ADD COLUMN section TEXT'); } catch { /* déjà */ }
  ensured = true;
}

export interface SimpleShop { id: string; owner_id: string; name: string; description: string | null; category: string | null; kind: string | null; public_key: string; wallet_enabled: number; created_at: number; lat: number | null; lng: number | null; cover_url: string | null; prep_min: number | null; address: string | null; phone: string | null; hours: string | null; service_mode: string | null; delivery_fee_cents: number | null; min_order_cents: number | null }
export interface SimpleItem { id: string; shop_id: string; image_url: string; label: string | null; price_cents: number; position: number; created_at: number; description: string | null; section: string | null }

export function createSimpleShop(ownerId: string, name: string, description?: string, category?: string, kind: 'boutique' | 'eat' | 'plat_maison' = 'boutique', opts?: { lat?: number | null; lng?: number | null; coverUrl?: string | null; prepMin?: number | null; address?: string | null; phone?: string | null; hours?: string | null; serviceMode?: string | null; deliveryFeeCents?: number | null; minOrderCents?: number | null }): SimpleShop {
  ensure();
  const id = randomUUID();
  const key = randomBytes(7).toString('hex');
  const now = Date.now();
  getDb().prepare('INSERT INTO simple_shops (id, owner_id, name, description, category, kind, public_key, wallet_enabled, created_at, lat, lng, cover_url, prep_min, address, phone, hours, service_mode, delivery_fee_cents, min_order_cents) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
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
  return (getDb().prepare('SELECT * FROM simple_shops WHERE id = ?').get(id) as SimpleShop) || null;
}
export function getSimpleShopByKey(key: string): SimpleShop | null {
  ensure();
  return (getDb().prepare('SELECT * FROM simple_shops WHERE public_key = ?').get(key) as SimpleShop) || null;
}
export function listSimpleShops(ownerId: string): SimpleShop[] {
  ensure();
  return getDb().prepare('SELECT * FROM simple_shops WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as SimpleShop[];
}
export function listItems(shopId: string): SimpleItem[] {
  ensure();
  return getDb().prepare('SELECT * FROM simple_shop_items WHERE shop_id = ? ORDER BY position ASC, created_at ASC').all(shopId) as SimpleItem[];
}
export function addItem(shopId: string, imageUrl: string, priceCents: number, label?: string | null, extra?: { description?: string | null; section?: string | null }): SimpleItem {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  const pos = (getDb().prepare('SELECT COUNT(*) c FROM simple_shop_items WHERE shop_id = ?').get(shopId) as { c: number }).c;
  getDb().prepare('INSERT INTO simple_shop_items (id, shop_id, image_url, label, price_cents, position, created_at, description, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, shopId, imageUrl, (label || '').slice(0, 120) || null, Math.max(0, Math.round(priceCents)), pos, now,
      (extra?.description || '').slice(0, 300) || null, (extra?.section || '').slice(0, 40) || null);
  return getDb().prepare('SELECT * FROM simple_shop_items WHERE id = ?').get(id) as SimpleItem;
}

/** Plats maison à proximité (rayon en mètres) — les voisins connectés les voient. */
export function listPlatMaisonNearby(lat: number, lng: number, radiusM = 500, excludeOwner?: string): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const rows = getDb().prepare("SELECT * FROM simple_shops WHERE kind = 'plat_maison' AND lat IS NOT NULL AND lng IS NOT NULL").all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    if (excludeOwner && s.owner_id === excludeOwner) continue;
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (getDb().prepare('SELECT COUNT(*) c FROM simple_shop_items WHERE shop_id = ?').get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 30);
}

/** Commerces d'un kind donné à proximité (rayon en mètres) — pour le RADAR. */
export function listShopsNearby(kind: string, lat: number, lng: number, radiusM = 500): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const rows = getDb().prepare('SELECT * FROM simple_shops WHERE kind = ? AND lat IS NOT NULL AND lng IS NOT NULL').all(kind) as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (getDb().prepare('SELECT COUNT(*) c FROM simple_shop_items WHERE shop_id = ?').get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 40);
}
export function deleteItem(shopId: string, itemId: string): void {
  ensure();
  getDb().prepare('DELETE FROM simple_shop_items WHERE id = ? AND shop_id = ?').run(itemId, shopId);
}
/** Remplace la photo d'un article (ex : après nettoyage IA). Pascal 2026-06-11. */
export function updateItemImage(shopId: string, itemId: string, imageUrl: string): SimpleItem | null {
  ensure();
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
  getDb().prepare('UPDATE simple_shop_items SET image_url = ? WHERE id = ? AND shop_id = ?').run(imageUrl, itemId, shopId);
  return (getDb().prepare('SELECT * FROM simple_shop_items WHERE id = ?').get(itemId) as SimpleItem) || null;
}
export function setWalletEnabled(id: string, ownerId: string, on: boolean): void {
  ensure();
  getDb().prepare('UPDATE simple_shops SET wallet_enabled = ? WHERE id = ? AND owner_id = ?').run(on ? 1 : 0, id, ownerId);
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
  getDb().prepare('UPDATE simple_shops SET description = ? WHERE id = ? AND owner_id = ?')
    .run((description || '').trim().slice(0, 300) || null, id, ownerId);
  return (getDb().prepare('SELECT * FROM simple_shops WHERE id = ?').get(id) as SimpleShop) || null;
}
