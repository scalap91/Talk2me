/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-commerce — domaine « Shop & Commerce » (wallet/boost #427, boutiques #428,
 * annonces, produits boutique) sous-extrait de lib/db-posts (decoupage #53, Pascal
 * 2026-06-30). getDb via socle ; cards via facade @/lib/db. Re-exporte par db.ts.
 */
import { randomUUID } from 'crypto';
import { getShopDb } from '@/lib/shop-db';
import { getDb } from '@/lib/db-core';
import { createDirectCard, parseDirectCardRow, getPostAuthorsByIds } from '@/lib/db';
import type { DbDirectCard, PostAuthor } from '@/lib/db';
import { writeCardFile } from '@/lib/cards/card-file';
import { fromFeedImageCard } from '@/lib/cards/adapt';
import type { SuperCard } from '@/lib/cards/supercard';

// ============ Wallet / Boost (Talk2Me #427) ============
// Post gratuit, boost payant débité du Wallet. Montants en CENTIMES.

export interface WalletTx {
  id: string;
  amount_cents: number;
  kind: string;
  label: string | null;
  ref_id: string | null;
  created_at: number;
  currency: string;
}

/**
 * Solde du wallet. Wallet MULTI-DEVISE : on calcule TOUJOURS par devise.
 * - `getWalletBalance(userId, 'MGA')` → solde dans cette devise.
 * - `getWalletBalance(userId)` (sans devise) → somme brute toutes lignes (LEGACY,
 *   conservé pour les appelants mono-devise existants : escrow/boost/payout ;
 *   à rendre currency-aware en phase 2). Ne jamais afficher ce total à l'user.
 */
export function getWalletBalance(userId: string, currency?: string): number {
  if (!userId) return 0;
  const db = getDb();
  const row = currency
    ? db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS bal FROM wallet_transactions WHERE user_id = ? AND currency = ?').get(userId, currency) as { bal: number }
    : db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS bal FROM wallet_transactions WHERE user_id = ?').get(userId) as { bal: number };
  return row?.bal ?? 0;
}

/** Soldes ventilés PAR devise (le vrai solde multi-devise à afficher). */
export function getWalletBalancesByCurrency(userId: string): { currency: string; balance_cents: number }[] {
  if (!userId) return [];
  return getDb()
    .prepare('SELECT currency, COALESCE(SUM(amount_cents),0) AS balance_cents FROM wallet_transactions WHERE user_id = ? GROUP BY currency HAVING balance_cents != 0 ORDER BY balance_cents DESC')
    .all(userId) as { currency: string; balance_cents: number }[];
}

export function getWalletTransactions(userId: string, limit = 50): WalletTx[] {
  if (!userId) return [];
  return getDb()
    .prepare(
      'SELECT id, amount_cents, kind, label, ref_id, created_at, currency FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(userId, limit) as WalletTx[];
}

export interface MonetisationSummary {
  total_cents: number;
  sales_cents: number;
  affiliation_cents: number;
  other_cents: number;
}

/** Résumé des GAINS de l'user (crédits réels du ledger, hors recharge/remboursement),
 *  ventilés par source. Sert l'onglet Monétisation du profil. */
export function getMonetisationSummary(userId: string): MonetisationSummary {
  const z: MonetisationSummary = { total_cents: 0, sales_cents: 0, affiliation_cents: 0, other_cents: 0 };
  if (!userId) return z;
  const rows = getDb()
    .prepare(
      "SELECT kind, COALESCE(SUM(amount_cents),0) AS c FROM wallet_transactions " +
      "WHERE user_id = ? AND amount_cents > 0 AND kind NOT IN ('topup','refund') GROUP BY kind"
    )
    .all(userId) as { kind: string; c: number }[];
  for (const r of rows) {
    if (r.kind === 'order' || r.kind === 'sale') z.sales_cents += r.c;
    else if (r.kind === 'commission' || r.kind.startsWith('affil')) z.affiliation_cents += r.c;
    else z.other_cents += r.c;
    z.total_cents += r.c;
  }
  return z;
}

/** Crédite/débite le Wallet (montant signé). MULTI-DEVISE : `currency` porte la
 *  devise de la ligne (défaut 'EUR' pour la compat des appelants existants ; le
 *  rail mobile money passe 'MGA'). Montant entier dans la plus petite unité de la
 *  devise (centimes pour EUR ; Ariary entier pour MGA, sans sous-unité). */
export function addWalletTransaction(
  userId: string,
  amountCents: number,
  kind: string,
  label: string | null,
  now: number,
  refId: string | null = null,
  currency = 'EUR'
): void {
  if (!userId || !Number.isFinite(amountCents) || amountCents === 0) return;
  getDb()
    .prepare(
      'INSERT INTO wallet_transactions (id, user_id, amount_cents, kind, label, ref_id, created_at, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(randomUUID(), userId, Math.round(amountCents), kind, label, refId, now, currency);
}

export interface BoostResult {
  ok: boolean;
  error?: string;
  balance_cents?: number;
  boosted_until?: number;
}

/** Booste un post de l'user : débit Wallet + étend boosted_until (atomique). */
export function boostCard(
  userId: string,
  cardKind: 'post' | 'direct_card',
  cardId: string,
  costCents: number,
  durationMs: number,
  now: number
): BoostResult {
  if (!userId) return { ok: false, error: 'unauthorized' };
  const db = getDb();
  const table = cardKind === 'post' ? 'posts' : 'direct_cards';
  try {
    const run = db.transaction(() => {
      const card = db.prepare(`SELECT user_id, boosted_until FROM ${table} WHERE id = ?`).get(cardId) as
        | { user_id: string; boosted_until: number | null }
        | undefined;
      if (!card) throw new Error('not_found');
      if (card.user_id !== userId) throw new Error('not_owner');
      const bal = (
        db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM wallet_transactions WHERE user_id = ?').get(userId) as { b: number }
      ).b;
      if (bal < costCents) throw new Error('insufficient_funds');
      db.prepare(
        'INSERT INTO wallet_transactions (id, user_id, amount_cents, kind, label, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), userId, -Math.abs(costCents), 'boost', 'Boost de post', cardId, now);
      const base = card.boosted_until && card.boosted_until > now ? card.boosted_until : now;
      const until = base + durationMs;
      db.prepare(`UPDATE ${table} SET boosted_until = ? WHERE id = ?`).run(until, cardId);
      return until;
    });
    const until = run();
    return { ok: true, balance_cents: getWalletBalance(userId), boosted_until: until };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

// ============ Boutiques (Talk2Me #428) ============

export interface DbBoutique {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  /** object-position "X% Y%" de la cover (ajustée au doigt). */
  cover_position: string | null;
  slug: string | null;
  /** #429 — 'stock' (marchandise en main) ou 'dropship' (fournisseur expédie). */
  kind?: string;
  created_at: number;
  author?: PostAuthor | null;
}

// Talk2Me #428 — slugs publics (talk2me.fr/<slug>). On évite de masquer les
// routes de l'app : tout slug entrant en collision reçoit un suffixe numérique.
const BOUTIQUE_RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', 'boutique', 'boutiques', 'c', 'credits', 'drafts',
  'friends', 'home', 'messages', 'profile', 'schema', 'signin', 'signup',
  'trash', 'u', 'uploads', 'wallet', 'saved-cards', 'mes-cards', 'pwa-diag',
  'sound-test', 'sfu-test', 'shop', 'card', 'cards', 'post', 'posts', 'app',
]);

export function slugifyBoutique(name: string): string {
  const base = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') // tout coller (yaya boutique -> yayaboutique)
    .slice(0, 40);
  return base || 'boutique';
}

/** Génère un slug unique (non réservé, non déjà pris). */
function uniqueBoutiqueSlug(name: string): string {
  const db = getDb();
  let base = slugifyBoutique(name);
  if (BOUTIQUE_RESERVED_SLUGS.has(base)) base = base + 'shop';
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = db.prepare('SELECT 1 FROM boutiques WHERE slug = ?').get(slug);
    if (!exists && !BOUTIQUE_RESERVED_SLUGS.has(slug)) return slug;
    n += 1;
    slug = `${base}${n}`;
  }
}

export function createBoutique(
  userId: string,
  input: { name: string; description?: string | null; cover_url?: string | null; cover_position?: string | null; kind?: string },
  now: number
): DbBoutique {
  if (!userId || !input?.name?.trim()) throw new Error('name required');
  const id = randomUUID();
  const name = input.name.trim().slice(0, 80);
  const description = input.description?.trim().slice(0, 500) ?? null;
  const slug = uniqueBoutiqueSlug(name);
  const kind = input.kind === 'dropship' ? 'dropship' : 'stock';
  const coverPosition =
    typeof input.cover_position === 'string' && /^\d{1,3}% \d{1,3}%$/.test(input.cover_position.trim())
      ? input.cover_position.trim()
      : null;
  getDb()
    .prepare(
      'INSERT INTO boutiques (id, user_id, name, description, cover_url, cover_position, slug, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, userId, name, description, input.cover_url ?? null, coverPosition, slug, kind, now);
  return {
    id,
    user_id: userId,
    name,
    description,
    cover_url: input.cover_url ?? null,
    cover_position: coverPosition,
    slug,
    kind,
    created_at: now,
  };
}

/** Résout une boutique par son slug public (talk2me.fr/<slug>). */
export function getBoutiqueBySlug(slug: string): DbBoutique | null {
  if (!slug) return null;
  const row = getDb().prepare('SELECT * FROM boutiques WHERE slug = ?').get(slug) as any;
  if (!row) return null;
  const author = getPostAuthorsByIds([row.user_id]).get(row.user_id) ?? null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description ?? null,
    cover_url: row.cover_url ?? null,
    cover_position: row.cover_position ?? null,
    slug: row.slug ?? null,
    created_at: row.created_at,
    author,
  };
}

export function getBoutiqueById(id: string): DbBoutique | null {
  if (!id) return null;
  const row = getDb().prepare('SELECT * FROM boutiques WHERE id = ?').get(id) as any;
  if (!row) return null;
  const author = getPostAuthorsByIds([row.user_id]).get(row.user_id) ?? null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description ?? null,
    cover_url: row.cover_url ?? null,
    cover_position: row.cover_position ?? null,
    slug: row.slug ?? null,
    created_at: row.created_at,
    author,
  };
}

export function getUserBoutiques(userId: string): DbBoutique[] {
  if (!userId) return [];
  const rows = getDb()
    .prepare('SELECT * FROM boutiques WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as any[];
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    description: r.description ?? null,
    cover_url: r.cover_url ?? null,
    cover_position: r.cover_position ?? null,
    slug: r.slug ?? null,
    created_at: r.created_at,
  }));
}

/** Produits d'une boutique, non supprimés/archivés. Catalogue séparé : lus dans
 *  shop_products (miroir de direct_cards → parseDirectCardRow s'applique tel quel). */
export function getBoutiqueProducts(boutiqueId: string): DbDirectCard[] {
  if (!boutiqueId) return [];
  const rows = getShopDb()
    .prepare(
      `SELECT * FROM shop_products
       WHERE boutique_id = ? AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY (boosted_until IS NOT NULL AND boosted_until > ?) DESC, created_at DESC`
    )
    .all(boutiqueId, Date.now()) as any[];
  return rows.map(parseDirectCardRow);
}

/** Card OS — UN produit-card par id, décorrélé de la boutique (Pascal 2026-07-03).
 *  Le paiement (`resolveOrderTarget`) lit le produit directement : vendeur = `user_id`,
 *  prix = `attached_product_json`. Permet de supprimer la table `boutiques` sans casser
 *  le rail paiement (le lecteur ne dépend plus du conteneur boutique). */
/** Backfill Card OS : TOUS les produits catalogue (pour les produire comme cards du moteur). */
export function listAllShopProducts(): { id: string; user_id: string; media_url: string | null; caption: string | null; attached_product_json: string | null; category: string | null }[] {
  return getShopDb()
    .prepare(`SELECT id, user_id, media_url, caption, attached_product_json, category FROM shop_products WHERE deleted_at IS NULL AND archived_at IS NULL`)
    .all() as { id: string; user_id: string; media_url: string | null; caption: string | null; attached_product_json: string | null; category: string | null }[];
}

export function getShopProductForCard(id: string): { id: string; user_id: string; attached_product_json: string | null } | null {
  if (!id) return null;
  const row = getShopDb()
    .prepare(`SELECT id, user_id, attached_product_json FROM shop_products WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL`)
    .get(id) as { id: string; user_id: string; attached_product_json: string | null } | undefined;
  return row ?? null;
}

/** Crée un PRODUIT catalogue dans shop_products (table séparée des cards perso).
 *  Remplace l'ancien createDirectCard pour l'import dropshipping. */
export function createShopProduct(
  userId: string,
  p: { type?: string; media_url: string; caption?: string | null; attached_product_json: string; boutique_id: string; category?: string | null }
): { id: string } {
  const id = randomUUID();
  getShopDb()
    .prepare(
      `INSERT INTO shop_products (id, user_id, type, media_url, caption, attached_product_json, boutique_id, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, userId, p.type || 'image', p.media_url, p.caption ?? null, p.attached_product_json, p.boutique_id, p.category ?? null, Date.now());
  // Card OS : un produit boutique EST une `.card` (fichier). Best-effort, fire-and-forget.
  void writeCardFile(shopProductToCard({ id, media_url: p.media_url, caption: p.caption ?? null, attached_product_json: p.attached_product_json })).catch(() => {});
  return { id };
}

/** Un produit boutique → `.card` (Pascal 2026-07-11 « tout est card »). channel=boutique pour le
 *  lecteur/rail commerce ; le reste (image, prix, action Acheter) vient de `fromFeedImageCard`. */
export function shopProductToCard(p: { id: string; media_url: string | null; caption: string | null; attached_product_json: string | null }): SuperCard {
  return { ...fromFeedImageCard({ id: p.id, media_url: p.media_url, caption: p.caption, text: null, attached_product_json: p.attached_product_json }), channel: 'boutique' };
}

/** Backfill : écrit le `.card` de TOUS les produits boutique existants. */
export async function backfillShopCards(): Promise<number> {
  let n = 0;
  for (const r of listAllShopProducts()) {
    try { await writeCardFile(shopProductToCard({ id: r.id, media_url: r.media_url, caption: r.caption, attached_product_json: r.attached_product_json })); n++; } catch { /* best-effort */ }
  }
  return n;
}

/** Talk2Me — Petites annonces (Pascal 2026-06-11). Une annonce = un produit
 *  boutique dont le vendeur a coché « publier aussi en petite annonce ».
 *  Renvoie la card + l'auteur + la boutique pour l'affichage du fil public. */
export interface DbAnnonce extends DbDirectCard {
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  boutique: { id: string; name: string; slug: string | null } | null;
}

export function getAnnonces(opts: { city?: string; category?: string; q?: string; limit?: number; offset?: number } = {}): DbAnnonce[] {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where: string[] = ['ad_listed_at IS NOT NULL', 'deleted_at IS NULL', 'archived_at IS NULL'];
  const args: unknown[] = [];
  if (opts.city && opts.city.trim()) { where.push('LOWER(ad_city) = LOWER(?)'); args.push(opts.city.trim()); }
  if (opts.category && opts.category.trim()) { where.push('LOWER(category) = LOWER(?)'); args.push(opts.category.trim()); }
  if (opts.q && opts.q.trim()) { where.push('LOWER(caption) LIKE ?'); args.push('%' + opts.q.trim().toLowerCase() + '%'); }
  // Base dédiée Shop (shop.db) : produits lus SANS JOIN inter-base.
  const products = getShopDb()
    .prepare(`SELECT * FROM shop_products WHERE ${where.join(' AND ')} ORDER BY ad_listed_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as any[];
  // Enrichissement auteur + boutique PAR ID depuis la base principale (pas de JOIN
  // cross-base → le Shop reste extractible sur un autre serveur).
  const main = getDb();
  const uStmt = main.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?');
  const bStmt = main.prepare('SELECT id, name, slug FROM boutiques WHERE id = ?');
  return products.map((row) => {
    const u = row.user_id ? (uStmt.get(row.user_id) as any) : null;
    const b = row.boutique_id ? (bStmt.get(row.boutique_id) as any) : null;
    return {
      ...parseDirectCardRow(row),
      author: u ? { id: u.id, username: u.username, display_name: u.display_name ?? null, avatar_url: u.avatar_url ?? null } : null,
      boutique: b ? { id: b.id, name: b.name, slug: b.slug ?? null } : null,
    };
  });
}

/** Villes distinctes ayant au moins une annonce active (pour le filtre). */
export function getAnnonceCities(): string[] {
  const rows = getShopDb()
    .prepare(
      `SELECT DISTINCT ad_city AS city FROM shop_products
        WHERE ad_listed_at IS NOT NULL AND deleted_at IS NULL AND archived_at IS NULL
          AND ad_city IS NOT NULL AND TRIM(ad_city) <> ''
        ORDER BY LOWER(ad_city)`
    )
    .all() as any[];
  return rows.map((r) => r.city as string);
}

/** Active / désactive la mise en annonce d'un produit (propriété vérifiée). */
export function setCardAdListing(cardId: string, userId: string, listed: boolean, city?: string | null): boolean {
  if (!cardId || !userId) return false;
  // Le produit mis en annonce vit dans shop_products (catalogue séparé) ; fallback
  // direct_cards au cas où (card perso avec produit attaché).
  // Produit catalogue → shop.db ; fallback card perso → base principale.
  let r = getShopDb()
    .prepare('UPDATE shop_products SET ad_listed_at = ?, ad_city = ? WHERE id = ? AND user_id = ?')
    .run(listed ? Date.now() : null, listed ? (city ?? null) : null, cardId, userId);
  if (!r.changes) {
    r = getDb()
      .prepare('UPDATE direct_cards SET ad_listed_at = ?, ad_city = ? WHERE id = ? AND user_id = ?')
      .run(listed ? Date.now() : null, listed ? (city ?? null) : null, cardId, userId);
  }
  return r.changes > 0;
}

/** Boutiques pour le Shop (boostées d'abord via leurs produits — MVP : récentes). */
export function getBoutiquesForShop(limit = 20): DbBoutique[] {
  const rows = getDb()
    .prepare('SELECT * FROM boutiques WHERE hidden IS NULL OR hidden = 0 ORDER BY created_at DESC LIMIT ?')
    .all(limit) as any[];
  const authors = getPostAuthorsByIds(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    description: r.description ?? null,
    cover_url: r.cover_url ?? null,
    cover_position: r.cover_position ?? null,
    slug: r.slug ?? null,
    created_at: r.created_at,
    author: authors.get(r.user_id) ?? null,
  }));
}

