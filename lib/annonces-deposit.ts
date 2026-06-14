import 'server-only';

/**
 * Talk2Me — DÉPÔT D'ANNONCE (Pascal 2026-06-11). Dans la page Annonces, un bouton
 * « Déposer votre annonce » ouvre un FORMULAIRE IMPOSÉ : photo, catégorie, titre,
 * description, prix, ville. L'annonce peut être enregistrée en BROUILLON, PUBLIÉE,
 * ou rattachée à une de ses boutiques (simple_shops). Données réelles (grounding).
 */
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

export const ANNONCE_CATEGORIES = [
  'Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules',
  'Beauté', 'Plat', 'Loisirs', 'Services', 'Emploi', 'Immobilier', 'Autres',
] as const;

export interface DepositAnnonce {
  id: string;
  user_id: string;
  shop_id: string | null;
  title: string;
  description: string | null;
  category: string;
  price_cents: number | null;
  city: string | null;
  image_url: string | null;
  status: 'draft' | 'published';
  lat: number | null;
  lng: number | null;
  created_at: number;
  updated_at: number;
}

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS deposit_annonces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shop_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      price_cents INTEGER,
      city TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deposit_annonces_user ON deposit_annonces(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deposit_annonces_pub ON deposit_annonces(status, created_at DESC);
  `);
  // Géoréférencement (Pascal 2026-06-11 : plats = économie de proximité). Idempotent.
  try { getDb().exec('ALTER TABLE deposit_annonces ADD COLUMN lat REAL'); } catch { /* déjà */ }
  try { getDb().exec('ALTER TABLE deposit_annonces ADD COLUMN lng REAL'); } catch { /* déjà */ }
  ensured = true;
}

function clampCat(c: string | null | undefined): string {
  const v = (c || '').trim();
  return (ANNONCE_CATEGORIES as readonly string[]).includes(v) ? v : 'Autres';
}

export interface UpsertAnnonceInput {
  id?: string;
  title: string;
  description?: string | null;
  category: string;
  price?: number | null; // euros
  city?: string | null;
  image_url?: string | null;
  shop_id?: string | null;
  status: 'draft' | 'published';
  lat?: number | null;
  lng?: number | null;
}

/** Crée ou met à jour une annonce de l'utilisateur (ownership vérifiée à l'update). */
export function upsertAnnonce(userId: string, input: UpsertAnnonceInput): DepositAnnonce | null {
  ensure();
  const db = getDb();
  const now = Date.now();
  const title = (input.title || '').trim().slice(0, 120);
  if (!title) return null;
  const description = (input.description || '').trim().slice(0, 2000) || null;
  const category = clampCat(input.category);
  const price_cents = input.price != null && !Number.isNaN(Number(input.price)) ? Math.max(0, Math.round(Number(input.price) * 100)) : null;
  const city = (input.city || '').trim().slice(0, 80) || null;
  const image_url = input.image_url && input.image_url.startsWith('/uploads/') ? input.image_url : null;
  const shop_id = (input.shop_id || '').trim() || null;
  const status = input.status === 'published' ? 'published' : 'draft';
  const lat = typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : null;
  const lng = typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : null;

  if (input.id) {
    const r = db.prepare(
      `UPDATE deposit_annonces SET shop_id = ?, title = ?, description = ?, category = ?, price_cents = ?, city = ?, image_url = ?, status = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), updated_at = ?
        WHERE id = ? AND user_id = ?`
    ).run(shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, now, input.id, userId);
    if (r.changes === 0) return null;
    return db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(input.id) as DepositAnnonce;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO deposit_annonces (id, user_id, shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, now, now);
  return db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(id) as DepositAnnonce;
}

export function listMyAnnonces(userId: string): DepositAnnonce[] {
  ensure();
  return getDb().prepare('SELECT * FROM deposit_annonces WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DepositAnnonce[];
}

export function deleteAnnonce(userId: string, id: string): boolean {
  ensure();
  return getDb().prepare('DELETE FROM deposit_annonces WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export interface PublicAnnonce {
  id: string; title: string; description: string | null; category: string;
  price_label: string | null; city: string | null; image_url: string | null;
  seller: { username: string; display_name: string | null } | null;
  shop_key: string | null; shop_name: string | null;
}

function eur(c: number): string {
  return (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';
}

/** Annonces PUBLIÉES (déposées via formulaire) groupées par catégorie. */
export function getPublishedAnnonces(opts: { category?: string; city?: string } = {}): PublicAnnonce[] {
  ensure();
  const where: string[] = ["a.status = 'published'"];
  const args: unknown[] = [];
  if (opts.category) { where.push('a.category = ?'); args.push(clampCat(opts.category)); }
  if (opts.city) { where.push('LOWER(a.city) = LOWER(?)'); args.push(opts.city.trim()); }
  let rows: any[];
  try {
    rows = getDb().prepare(
      `SELECT a.*, u.username AS u_username, u.display_name AS u_display, s.public_key AS shop_key, s.name AS shop_name
         FROM deposit_annonces a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN simple_shops s ON s.id = a.shop_id
        WHERE ${where.join(' AND ')}
        ORDER BY a.created_at DESC LIMIT 200`
    ).all(...args) as any[];
  } catch {
    // simple_shops absente → on retombe sans le lien boutique
    rows = getDb().prepare(
      `SELECT a.*, u.username AS u_username, u.display_name AS u_display
         FROM deposit_annonces a LEFT JOIN users u ON u.id = a.user_id
        WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT 200`
    ).all(...args) as any[];
  }
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description, category: r.category,
    price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
    city: r.city, image_url: r.image_url,
    seller: r.u_username ? { username: r.u_username, display_name: r.u_display ?? null } : null,
    shop_key: r.shop_key ?? null, shop_name: r.shop_name ?? null,
  }));
}
