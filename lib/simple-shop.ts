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
import { commerceDb, COMMERCE_KINDS, shopTable, itemTable, type Kind } from '@/lib/commerce-dbs';

// 3 bases séparées (boutiques.db / plats.db / eat.db) — cf. lib/commerce-dbs.ts.
// Helpers : connexion + nom de table par kind. Pas de UNION SQL inter-base : les
// lectures cross-kind interrogent les 3 connexions et fusionnent en JS.
const norm = (kind?: string | null): Kind =>
  (kind === 'eat' || kind === 'plat_maison') ? kind : 'boutique';
const dbFor = (kind?: string | null) => commerceDb(norm(kind));

function ensure() {
  // Déclenche création + migration one-time des 3 bases (idempotent).
  for (const k of COMMERCE_KINDS) commerceDb(k);
}

const ANNONCE_VALIDITY_MS = 90 * 24 * 60 * 60 * 1000; // 3 mois

export interface SimpleShop { id: string; owner_id: string; name: string; description: string | null; category: string | null; kind: string | null; public_key: string; wallet_enabled: number; created_at: number; lat: number | null; lng: number | null; cover_url: string | null; prep_min: number | null; address: string | null; phone: string | null; hours: string | null; service_mode: string | null; delivery_fee_cents: number | null; min_order_cents: number | null }
export interface SimpleItem { id: string; shop_id: string; image_url: string; label: string | null; price_cents: number; position: number; created_at: number; description: string | null; section: string | null; annonce_on?: number; annonce_category?: string | null; annonce_city?: string | null; annonce_lat?: number | null; annonce_lng?: number | null; annonce_until?: number | null }

export function createSimpleShop(ownerId: string, name: string, description?: string, category?: string, kind: Kind = 'boutique', opts?: { lat?: number | null; lng?: number | null; coverUrl?: string | null; prepMin?: number | null; address?: string | null; phone?: string | null; hours?: string | null; serviceMode?: string | null; deliveryFeeCents?: number | null; minOrderCents?: number | null }): SimpleShop {
  ensure();
  const id = randomUUID();
  const key = randomBytes(7).toString('hex');
  const now = Date.now();
  dbFor(kind).prepare(`INSERT INTO ${shopTable(norm(kind))} (id, owner_id, name, description, category, kind, public_key, wallet_enabled, created_at, lat, lng, cover_url, prep_min, address, phone, hours, service_mode, delivery_fee_cents, min_order_cents) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ownerId, (name || '').trim().slice(0, 80) || (kind === 'eat' ? 'Mon resto' : kind === 'plat_maison' ? 'Mes plats maison' : 'Ma boutique'), (description || '').trim().slice(0, 300) || null, (category || '').trim().slice(0, 40) || (kind === 'eat' ? 'Restaurant' : null), kind, key, now,
      opts?.lat ?? null, opts?.lng ?? null, opts?.coverUrl ?? null, opts?.prepMin ?? null,
      (opts?.address || '').slice(0, 200) || null, (opts?.phone || '').slice(0, 40) || null, (opts?.hours || '').slice(0, 200) || null,
      (opts?.serviceMode || '').slice(0, 60) || null,
      typeof opts?.deliveryFeeCents === 'number' ? opts.deliveryFeeCents : null,
      typeof opts?.minOrderCents === 'number' ? opts.minOrderCents : null);
  return getSimpleShop(id)!;
}

/** Supprime une boutique / plat maison / resto (PROPRIÉTAIRE uniquement) + ses articles.
 *  Renvoie true si quelque chose a été supprimé. (Pascal 2026-06-17) */
export function deleteSimpleShop(id: string, ownerId: string): boolean {
  ensure();
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== ownerId) return false;
  const k = norm(shop.kind);
  const db = dbFor(k);
  db.prepare(`DELETE FROM ${itemTable(k)} WHERE shop_id = ?`).run(id);
  return db.prepare(`DELETE FROM ${shopTable(k)} WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes > 0;
}

export function getSimpleShop(id: string): SimpleShop | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    const r = commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE id = ?`).get(id) as SimpleShop | undefined;
    if (r) return r;
  }
  return null;
}
export function getSimpleShopByKey(key: string): SimpleShop | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    const r = commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE public_key = ?`).get(key) as SimpleShop | undefined;
    if (r) return r;
  }
  return null;
}
export function listSimpleShops(ownerId: string): SimpleShop[] {
  ensure();
  const out: SimpleShop[] = [];
  for (const k of COMMERCE_KINDS) {
    out.push(...(commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE owner_id = ?`).all(ownerId) as SimpleShop[]));
  }
  return out.sort((a, b) => b.created_at - a.created_at);
}
export function listItems(shopId: string): SimpleItem[] {
  ensure();
  const out: SimpleItem[] = [];
  for (const k of COMMERCE_KINDS) {
    out.push(...(commerceDb(k).prepare(`SELECT * FROM ${itemTable(k)} WHERE shop_id = ?`).all(shopId) as SimpleItem[]));
  }
  return out.sort((a, b) => (a.position - b.position) || (a.created_at - b.created_at));
}
export function addItem(shopId: string, imageUrl: string, priceCents: number, label?: string | null, extra?: { description?: string | null; section?: string | null }): SimpleItem {
  ensure();
  const shop = getSimpleShop(shopId);
  const k = norm(shop?.kind);
  const db = dbFor(k);
  const table = itemTable(k);
  const id = randomUUID();
  const now = Date.now();
  const pos = (db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE shop_id = ?`).get(shopId) as { c: number }).c;
  db.prepare(`INSERT INTO ${table} (id, shop_id, image_url, label, price_cents, position, created_at, description, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, shopId, imageUrl, (label || '').slice(0, 120) || null, Math.max(0, Math.round(priceCents)), pos, now,
      (extra?.description || '').slice(0, 300) || null, (extra?.section || '').slice(0, 40) || null);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SimpleItem;
}

/** Plats maison à proximité (rayon en mètres) — les voisins connectés les voient. */
export function listPlatMaisonNearby(lat: number, lng: number, radiusM = 500, excludeOwner?: string): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const db = commerceDb('plat_maison');
  const rows = db.prepare(`SELECT * FROM ${shopTable('plat_maison')} WHERE lat IS NOT NULL AND lng IS NOT NULL`).all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    if (excludeOwner && s.owner_id === excludeOwner) continue;
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (db.prepare(`SELECT COUNT(*) c FROM ${itemTable('plat_maison')} WHERE shop_id = ?`).get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 30);
}

/** Commerces d'un kind donné à proximité (rayon en mètres) — pour le RADAR. */
export function listShopsNearby(kind: string, lat: number, lng: number, radiusM = 500): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const k = norm(kind);
  const db = dbFor(k);
  const rows = db.prepare(`SELECT * FROM ${shopTable(k)} WHERE lat IS NOT NULL AND lng IS NOT NULL`).all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (db.prepare(`SELECT COUNT(*) c FROM ${itemTable(k)} WHERE shop_id = ?`).get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 40);
}
export function deleteItem(shopId: string, itemId: string): void {
  ensure();
  const k = norm(getSimpleShop(shopId)?.kind);
  dbFor(k).prepare(`DELETE FROM ${itemTable(k)} WHERE id = ? AND shop_id = ?`).run(itemId, shopId);
}
/** Remplace la photo d'un article (ex : après nettoyage IA). Pascal 2026-06-11. */
export function updateItemImage(shopId: string, itemId: string, imageUrl: string): SimpleItem | null {
  ensure();
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
  const k = norm(getSimpleShop(shopId)?.kind);
  const db = dbFor(k);
  db.prepare(`UPDATE ${itemTable(k)} SET image_url = ? WHERE id = ? AND shop_id = ?`).run(imageUrl, itemId, shopId);
  return (db.prepare(`SELECT * FROM ${itemTable(k)} WHERE id = ?`).get(itemId) as SimpleItem) || null;
}
/** Ré-éditer un article (nom, prix, description). owner via shop_id. Pascal 2026-06-20. */
export function updateItemFields(shopId: string, itemId: string, fields: { label?: string | null; price_cents?: number; description?: string | null }): SimpleItem | null {
  ensure();
  const k = norm(getSimpleShop(shopId)?.kind);
  const db = dbFor(k);
  const sets: string[] = []; const vals: (string | number | null)[] = [];
  if (fields.label !== undefined) { sets.push('label = ?'); vals.push((fields.label || '').slice(0, 120) || null); }
  if (fields.price_cents !== undefined) { sets.push('price_cents = ?'); vals.push(Math.max(0, Math.round(fields.price_cents))); }
  if (fields.description !== undefined) { sets.push('description = ?'); vals.push((fields.description || '').slice(0, 2000) || null); }
  if (sets.length) db.prepare(`UPDATE ${itemTable(k)} SET ${sets.join(', ')} WHERE id = ? AND shop_id = ?`).run(...vals, itemId, shopId);
  return (db.prepare(`SELECT * FROM ${itemTable(k)} WHERE id = ?`).get(itemId) as SimpleItem) || null;
}

/** (Dés)active l'article dans les Petites annonces + champs annonce. Validité 3 mois à l'activation. */
export function setItemAnnonce(shopId: string, ownerId: string, itemId: string, on: boolean,
  opts?: { category?: string | null; city?: string | null; lat?: number | null; lng?: number | null }): SimpleItem | null {
  ensure();
  const db = commerceDb('boutique'); // annonces = boutiques uniquement (même base → JOIN valide)
  // ownership : l'article appartient à une boutique de l'owner
  const own = db.prepare('SELECT i.id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ? AND i.shop_id = ? AND s.owner_id = ?').get(itemId, shopId, ownerId);
  if (!own) return null;
  if (on) {
    const until = Date.now() + ANNONCE_VALIDITY_MS;
    db.prepare('UPDATE boutique_items SET annonce_on = 1, annonce_category = ?, annonce_city = ?, annonce_lat = ?, annonce_lng = ?, annonce_until = ? WHERE id = ?')
      .run(opts?.category || 'Autres', opts?.city || null, opts?.lat ?? null, opts?.lng ?? null, until, itemId);
  } else {
    db.prepare('UPDATE boutique_items SET annonce_on = 0 WHERE id = ?').run(itemId);
  }
  return (db.prepare('SELECT * FROM boutique_items WHERE id = ?').get(itemId) as SimpleItem) || null;
}

/** Articles boutique ACTUELLEMENT badgés « annonce » (annonce_on=1, non expirés),
 *  enrichis vendeur + boutique. Source de vérité = le flag (pas de duplication en
 *  deposit_annonces). Fait apparaître ces articles dans le feed Petites annonces. */
export function listAnnonceItems(opts: { category?: string; city?: string } = {}): Array<{ id: string; title: string; description: string | null; category: string; price_cents: number; city: string | null; image_url: string; owner_id: string; shop_key: string; shop_name: string; created_at: number }> {
  ensure();
  const db = commerceDb('boutique');
  const where = ['i.annonce_on = 1', 'i.annonce_until > ?'];
  const args: unknown[] = [Date.now()];
  if (opts.category) { where.push('i.annonce_category = ?'); args.push(opts.category); }
  if (opts.city) { where.push('LOWER(i.annonce_city) = LOWER(?)'); args.push(opts.city.trim()); }
  const rows = db.prepare(
    `SELECT i.*, s.owner_id AS owner_id, s.public_key AS shop_key, s.name AS shop_name
       FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id
      WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT 200`
  ).all(...args) as Array<SimpleItem & { owner_id: string; shop_key: string; shop_name: string }>;
  return rows.map((r) => ({
    id: r.id, title: r.label || 'Article', description: r.description, category: r.annonce_category || 'Autres',
    price_cents: r.price_cents, city: r.annonce_city || null, image_url: r.image_url,
    owner_id: r.owner_id, shop_key: r.shop_key, shop_name: r.shop_name, created_at: r.created_at,
  }));
}

/** MES articles badgés « annonce » (pour les éditer depuis la rubrique Annonces). */
export function listMyAnnonceItems(ownerId: string): Array<{ id: string; shop_id: string; title: string; price_cents: number; image_url: string; category: string; city: string | null; status: string }> {
  ensure();
  const db = commerceDb('boutique');
  const rows = db.prepare(
    `SELECT i.id, i.shop_id, i.label, i.price_cents, i.image_url, i.annonce_category, i.annonce_city, i.annonce_until
       FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id
      WHERE s.owner_id = ? AND i.annonce_on = 1 ORDER BY i.created_at DESC`
  ).all(ownerId) as Array<{ id: string; shop_id: string; label: string | null; price_cents: number; image_url: string; annonce_category: string | null; annonce_city: string | null; annonce_until: number | null }>;
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, shop_id: r.shop_id, title: r.label || 'Article', price_cents: r.price_cents, image_url: r.image_url,
    category: r.annonce_category || 'Autres', city: r.annonce_city || null,
    status: (r.annonce_until && r.annonce_until > now) ? 'published' : 'expired',
  }));
}

/** Article boutique par id, pour l'ACHAT (prix + vendeur résolus serveur). */
export function getBoutiqueItemForPurchase(itemId: string): { id: string; price_cents: number; owner_id: string } | null {
  ensure();
  const db = commerceDb('boutique');
  const r = db.prepare('SELECT i.id, i.price_cents, s.owner_id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ?').get(itemId) as { id: string; price_cents: number; owner_id: string } | undefined;
  return r || null;
}

/** Renouvelle la validité annonce pour 3 mois (à partir de maintenant). */
export function renewItemAnnonce(shopId: string, ownerId: string, itemId: string): SimpleItem | null {
  ensure();
  const db = commerceDb('boutique');
  const own = db.prepare('SELECT i.id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ? AND i.shop_id = ? AND s.owner_id = ?').get(itemId, shopId, ownerId);
  if (!own) return null;
  db.prepare('UPDATE boutique_items SET annonce_on = 1, annonce_until = ? WHERE id = ?').run(Date.now() + ANNONCE_VALIDITY_MS, itemId);
  return (db.prepare('SELECT * FROM boutique_items WHERE id = ?').get(itemId) as SimpleItem) || null;
}

export function setWalletEnabled(id: string, ownerId: string, on: boolean): void {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET wallet_enabled = ? WHERE id = ? AND owner_id = ?`).run(on ? 1 : 0, id, ownerId);
}
/** Longueur mini d'une description « complète » pour apparaître dans les Petites
 *  annonces (Pascal 2026-06-11 : pas de description complète → pas d'annonce). */
export const MIN_ANNONCE_DESC = 20;
export function isAnnonceReady(description: string | null | undefined): boolean {
  return !!description && description.trim().length >= MIN_ANNONCE_DESC;
}
/** Met à jour la description de la boutique (owner only). */
/** Met à jour la position d'un plat/boutique (pour la visibilité 500 m). Pascal 2026-06-20. */
export function updateShopGeo(id: string, ownerId: string, lat: number, lng: number): SimpleShop | null {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET lat = ?, lng = ? WHERE id = ? AND owner_id = ?`).run(lat, lng, id, ownerId);
  return getSimpleShop(id);
}

export function updateShopDescription(id: string, ownerId: string, description: string): SimpleShop | null {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  const desc = (description || '').trim().slice(0, 300) || null;
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET description = ? WHERE id = ? AND owner_id = ?`).run(desc, id, ownerId);
  return getSimpleShop(id);
}
