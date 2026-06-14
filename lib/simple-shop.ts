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
  ensured = true;
}

export interface SimpleShop { id: string; owner_id: string; name: string; description: string | null; category: string | null; kind: string | null; public_key: string; wallet_enabled: number; created_at: number }
export interface SimpleItem { id: string; shop_id: string; image_url: string; label: string | null; price_cents: number; position: number; created_at: number }

export function createSimpleShop(ownerId: string, name: string, description?: string, category?: string, kind: 'boutique' | 'eat' = 'boutique', opts?: { lat?: number | null; lng?: number | null; coverUrl?: string | null; prepMin?: number | null }): SimpleShop {
  ensure();
  const id = randomUUID();
  const key = randomBytes(7).toString('hex');
  const now = Date.now();
  getDb().prepare('INSERT INTO simple_shops (id, owner_id, name, description, category, kind, public_key, wallet_enabled, created_at, lat, lng, cover_url, prep_min) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)')
    .run(id, ownerId, (name || '').trim().slice(0, 80) || (kind === 'eat' ? 'Mon resto' : 'Ma boutique'), (description || '').trim().slice(0, 300) || null, (category || '').trim().slice(0, 40) || (kind === 'eat' ? 'Restaurant' : null), kind, key, now,
      opts?.lat ?? null, opts?.lng ?? null, opts?.coverUrl ?? null, opts?.prepMin ?? null);
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
export function addItem(shopId: string, imageUrl: string, priceCents: number, label?: string | null): SimpleItem {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  const pos = (getDb().prepare('SELECT COUNT(*) c FROM simple_shop_items WHERE shop_id = ?').get(shopId) as { c: number }).c;
  getDb().prepare('INSERT INTO simple_shop_items (id, shop_id, image_url, label, price_cents, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, shopId, imageUrl, (label || '').slice(0, 120) || null, Math.max(0, Math.round(priceCents)), pos, now);
  return getDb().prepare('SELECT * FROM simple_shop_items WHERE id = ?').get(id) as SimpleItem;
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
