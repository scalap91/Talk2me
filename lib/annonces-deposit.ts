import 'server-only';

/**
 * Talk2Me — DÉPÔT D'ANNONCE (Pascal 2026-06-11). Dans la page Annonces, un bouton
 * « Déposer votre annonce » ouvre un FORMULAIRE IMPOSÉ : photo, catégorie, titre,
 * description, prix, ville. L'annonce peut être enregistrée en BROUILLON, PUBLIÉE,
 * ou rattachée à une de ses boutiques (simple_shops). Données réelles (grounding).
 */
import { randomUUID } from 'crypto';
import { formatMoney, toMinor } from '@/lib/money';
import { getAnnoncesDb } from '@/lib/annonces-db';
import { getUserById } from '@/lib/db';
import { getSimpleShop, listAnnonceItems } from '@/lib/simple-shop';

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

// Base dédiée annonces.db (création + migration gérées par getAnnoncesDb).
function ensure() { getAnnoncesDb(); }
const db_ = () => getAnnoncesDb();

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
  const db = db_();
  const now = Date.now();
  const title = (input.title || '').trim().slice(0, 120);
  if (!title) return null;
  const description = (input.description || '').trim().slice(0, 2000) || null;
  const category = clampCat(input.category);
  const price_cents = input.price != null && !Number.isNaN(Number(input.price)) ? Math.max(0, toMinor(Number(input.price))) : null;
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
  return db_().prepare('SELECT * FROM deposit_annonces WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DepositAnnonce[];
}

/** Annonce par id pour l'ACHAT (prix + vendeur résolus côté serveur, jamais le client). */
export function getAnnonceForPurchase(id: string): { id: string; user_id: string; price_cents: number; title: string; status: string } | null {
  ensure();
  const r = db_().prepare('SELECT id, user_id, price_cents, title, status FROM deposit_annonces WHERE id = ?').get(id) as { id: string; user_id: string; price_cents: number; title: string; status: string } | undefined;
  return r || null;
}

export function deleteAnnonce(userId: string, id: string): boolean {
  ensure();
  return db_().prepare('DELETE FROM deposit_annonces WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export interface PublicAnnonce {
  id: string; title: string; description: string | null; category: string;
  price_label: string | null; city: string | null; image_url: string | null;
  seller: { username: string; display_name: string | null } | null;
  shop_key: string | null; shop_name: string | null;
}

function eur(c: number): string {
  return formatMoney(c);
}

/** Annonces PUBLIÉES (déposées via formulaire) groupées par catégorie. */
export function getPublishedAnnonces(opts: { category?: string; city?: string } = {}): PublicAnnonce[] {
  ensure();
  const where: string[] = ["status = 'published'"];
  const args: unknown[] = [];
  if (opts.category) { where.push('category = ?'); args.push(clampCat(opts.category)); }
  if (opts.city) { where.push('LOWER(city) = LOWER(?)'); args.push(opts.city.trim()); }
  // Annonces depuis annonces.db (AUCUN JOIN inter-base). seller/boutique résolus par ID.
  const rows = db_().prepare(
    `SELECT * FROM deposit_annonces WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`
  ).all(...args) as DepositAnnonce[];
  const fromDeposit: PublicAnnonce[] = rows.map((r) => {
    let seller: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.user_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    let shop_key: string | null = null, shop_name: string | null = null;
    if (r.shop_id) { try { const s = getSimpleShop(r.shop_id); if (s) { shop_key = s.public_key; shop_name = s.name; } } catch { /* */ } }
    return {
      id: r.id, title: r.title, description: r.description, category: r.category,
      price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
      city: r.city, image_url: r.image_url, seller, shop_key, shop_name,
    };
  });

  // + Articles de boutique badgés « annonce » (source = le flag annonce_on, pas de
  // duplication). C'est ce qui faisait que l'article badgé n'apparaissait PAS ici.
  let fromItems: PublicAnnonce[] = [];
  try {
    fromItems = listAnnonceItems({ category: opts.category, city: opts.city }).map((it) => {
      let seller: { username: string; display_name: string | null } | null = null;
      try { const u = getUserById(it.owner_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
      return {
        id: it.id, title: it.title, description: it.description, category: it.category,
        price_label: typeof it.price_cents === 'number' ? eur(it.price_cents) : null,
        city: it.city, image_url: it.image_url, seller, shop_key: it.shop_key, shop_name: it.shop_name,
      };
    });
  } catch { /* base boutique indispo : on renvoie au moins les annonces déposées */ }

  return [...fromItems, ...fromDeposit];
}
