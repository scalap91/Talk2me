'use server-only';

/**
 * Talk2Me — ANNONCES (Pascal 2026-06-10). L'onglet "Annonces" regroupe UNIQUEMENT
 * les boutiques créées DANS LE CHAT (petites boutiques `simple_shops`), PAR
 * CATÉGORIE. Pas les produits CJ (eux = onglet Shop). Données réelles, pas d'invention.
 */

import { getDb } from '@/lib/db';
import { isAnnonceReady } from '@/lib/simple-shop';

export interface AnnonceItem { id: string; media_url: string | null; title: string; category: string; price_label: string | null; shop_name: string; shop_key: string }
export interface AnnonceCategory { category: string; count: number; items: AnnonceItem[] }

function eur(c: number): string {
  return (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';
}

/** Articles des petites boutiques (chat) groupés par catégorie. */
export function getAnnoncesByCategory(): AnnonceCategory[] {
  const db = getDb();
  // S'assure que la colonne category existe (idempotent — l'ALTER de simple-shop
  // peut ne pas avoir tourné dans ce process).
  try { db.exec('ALTER TABLE simple_shops ADD COLUMN category TEXT'); } catch { /* déjà / table absente */ }
  let rows: { id: string; image_url: string; label: string | null; price_cents: number; shop_name: string; shop_desc: string | null; category: string | null; public_key: string }[] = [];
  try {
    rows = db.prepare(
      `SELECT i.id, i.image_url, i.label, i.price_cents, s.name AS shop_name, s.description AS shop_desc, s.category, s.public_key
         FROM simple_shop_items i
         JOIN simple_shops s ON s.id = i.shop_id
        ORDER BY i.created_at DESC`
    ).all() as typeof rows;
  } catch { return []; } // tables/colonne pas encore créées → rien

  const map = new Map<string, AnnonceItem[]>();
  for (const r of rows) {
    // Pascal 2026-06-11 : une boutique sans description COMPLÈTE n'apparaît pas
    // dans les Petites annonces (qualité + grounding, pas de fiche vide).
    if (!isAnnonceReady(r.shop_desc)) continue;
    const cat = (r.category && r.category.trim()) || 'Autres';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push({
      id: r.id, media_url: r.image_url, title: r.label || r.shop_name,
      category: cat, price_label: eur(r.price_cents), shop_name: r.shop_name, shop_key: r.public_key,
    });
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({ category, count: items.length, items }))
    .sort((a, b) => b.count - a.count);
}

/** Restaurants (boutiques kind='eat') pour l'onglet Eat — avec photo de couverture. */
export interface Resto { id: string; name: string; description: string | null; public_key: string; cover_url: string | null; items_count: number; lat: number | null; lng: number | null; prep_min: number | null }
export function getRestaurants(): Resto[] {
  const db = getDb();
  try { db.exec("ALTER TABLE simple_shops ADD COLUMN kind TEXT DEFAULT 'boutique'"); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE simple_shops ADD COLUMN lat REAL'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE simple_shops ADD COLUMN lng REAL'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE simple_shops ADD COLUMN prep_min INTEGER'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE simple_shops ADD COLUMN cover_url TEXT'); } catch { /* déjà */ }
  let shops: { id: string; name: string; description: string | null; public_key: string; lat: number | null; lng: number | null; prep_min: number | null; cover_url: string | null }[] = [];
  try {
    shops = db.prepare("SELECT id, name, description, public_key, lat, lng, prep_min, cover_url FROM simple_shops WHERE kind = 'eat' ORDER BY created_at DESC LIMIT 50").all() as typeof shops;
  } catch { return []; }
  const coverStmt = db.prepare('SELECT image_url FROM simple_shop_items WHERE shop_id = ? ORDER BY position ASC LIMIT 1');
  const countStmt = db.prepare('SELECT COUNT(*) c FROM simple_shop_items WHERE shop_id = ?');
  return shops.map((s) => ({
    id: s.id, name: s.name, description: s.description, public_key: s.public_key,
    cover_url: s.cover_url ?? (coverStmt.get(s.id) as { image_url?: string } | undefined)?.image_url ?? null,
    items_count: (countStmt.get(s.id) as { c: number }).c,
    lat: s.lat ?? null, lng: s.lng ?? null, prep_min: s.prep_min ?? null,
  }));
}

/** Services-métier créés dans le chat (messageries entreprise) avec catégorie. */
export interface ServiceAnnonce { id: string; name: string; description: string | null; category: string | null }
export function getServiceAnnonces(): ServiceAnnonce[] {
  const db = getDb();
  try { db.exec('ALTER TABLE business_inboxes ADD COLUMN description TEXT'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE business_inboxes ADD COLUMN category TEXT'); } catch { /* déjà */ }
  try {
    return db.prepare('SELECT id, name, description, category FROM business_inboxes ORDER BY created_at DESC LIMIT 50').all() as ServiceAnnonce[];
  } catch { return []; }
}
