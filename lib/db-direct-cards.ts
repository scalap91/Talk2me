/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-direct-cards — domaine « direct_cards » (cards directes en conversation,
 * mirroring feed unifie, catalogue boutique) extrait de lib/db.ts (decoupage
 * #53/db-core, Pascal 2026-06-30). getDb via socle ; indexCardSafely (posts) via facade.
 */
import { randomUUID } from 'crypto';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import { metadataMapFromDirectMedia } from '@/lib/search/metadata-map';
import { getShopDb } from '@/lib/shop-db';
import { getDb } from '@/lib/db-core';
import { indexCardSafely } from '@/lib/db'; // cross-domaine (posts), facade lazy
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { serializeCard } from '@/lib/cards/supercard';

// ============ direct_cards ============
// /lib/db/direct_cards.ts — Table direct_cards (Image/Vidéo/Texte créées
// via l'éditeur direct, hors clip de conversation).


export type DirectCardType = 'video' | 'image' | 'texte';

export interface DbDirectCard {
  id: string;
  user_id: string;
  type: DirectCardType;
  media_url: string | null;
  caption: string | null;
  text: string | null;
  bg_variant: string | null;
  created_at: number;
  likes: number;
  views: number;
  archived_at?: number | null;
  deleted_at?: number | null;
  share_count?: number;
  save_count?: number;
  comment_count?: number;
  /** Talk2Me #422 — UnifiedCard JSON pour la musique attachée. */
  attached_audio_json?: string | null;
  /** Talk2Me #425 — ProductCardData JSON pour le produit attaché (Hub+Shop). */
  attached_product_json?: string | null;
  /** Talk2Me #427 — boost payant : ms jusqu'auquel le post est mis en avant. */
  boosted_until?: number | null;
  /** Talk2Me #428 — boutique d'appartenance + catégorie (texte libre). */
  boutique_id?: string | null;
  category?: string | null;
  /** Talk2Me — petite annonce : ms de publication au fil annonces (NULL = non listé). */
  ad_listed_at?: number | null;
  /** Talk2Me — ville de l'annonce (filtre localisation). */
  ad_city?: string | null;
}

export interface CreateDirectCardInput {
  type: DirectCardType;
  media_url?: string | null;
  caption?: string | null;
  text?: string | null;
  bg_variant?: string | null;
  /**
   * Talk2Me #422 — UnifiedCard (audio/music) sérialisée en JSON pour
   * affichage du disque vinyle rotatif sur les VideoCard.
   */
  attached_audio_json?: string | null;
  /** Talk2Me #425 — ProductCardData JSON (la card va aussi dans le Shop). */
  attached_product_json?: string | null;
  /** Talk2Me #428 — boutique + catégorie (texte libre) pour ranger le produit. */
  boutique_id?: string | null;
  category?: string | null;
  /** Talk2Me — petite annonce : ms de publication (NULL = non listé). */
  ad_listed_at?: number | null;
  /** Talk2Me — ville de l'annonce. */
  ad_city?: string | null;
}

export function parseDirectCardRow(row: any): DbDirectCard {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as DirectCardType,
    media_url: row.media_url ?? null,
    caption: row.caption ?? null,
    text: row.text ?? null,
    bg_variant: row.bg_variant ?? null,
    created_at: row.created_at,
    likes: row.likes ?? 0,
    views: row.views ?? 0,
    archived_at: typeof row.archived_at === 'number' ? row.archived_at : null,
    deleted_at: typeof row.deleted_at === 'number' ? row.deleted_at : null,
    share_count: row.share_count ?? 0,
    save_count: row.save_count ?? 0,
    comment_count: row.comment_count ?? 0,
    attached_audio_json: row.attached_audio_json ?? null,
    attached_product_json: row.attached_product_json ?? null,
    boosted_until: typeof row.boosted_until === 'number' ? row.boosted_until : null,
    boutique_id: row.boutique_id ?? null,
    category: row.category ?? null,
    ad_listed_at: typeof row.ad_listed_at === 'number' ? row.ad_listed_at : null,
    ad_city: row.ad_city ?? null,
    post_type: row.post_type ?? null,
  };
}

/** Talk2Me #429 — LA boutique unique (type Shein) : tous les produits dropship
 *  groupés par catégorie. Sert l'onglet Shop ET les recos de Léa (catalogue interne). */
export interface StoreProduct {
  id: string; // card id
  title: string;
  image: string | null;
  price_label: string | null;
  category: string;
}
export function getStoreCatalog(perCategory = 0): { category: string; products: StoreProduct[] }[] {
  // Catalogue Shop = base DÉDIÉE shop.db (portabilité cross-serveur).
  const rows = getShopDb()
    .prepare(
      `SELECT id, category, attached_product_json FROM shop_products
       WHERE attached_product_json IS NOT NULL AND deleted_at IS NULL
       ORDER BY created_at DESC`
    )
    .all() as { id: string; category: string | null; attached_product_json: string }[];
  const groups = new Map<string, StoreProduct[]>();
  for (const r of rows) {
    let p: { title?: string; image_url?: string; price_label?: string; dropship?: boolean };
    try {
      p = JSON.parse(r.attached_product_json);
    } catch {
      continue;
    }
    if (!p.image_url || !p.title) continue;
    const cat = (r.category || 'Autres').trim();
    if (!groups.has(cat)) groups.set(cat, []);
    const list = groups.get(cat)!;
    if (perCategory > 0 && list.length >= perCategory) continue;
    list.push({ id: r.id, title: p.title, image: p.image_url, price_label: p.price_label ?? null, category: cat });
  }
  // Ordre FIXE des catégories (mode d'abord), stable : ajouter un article ne fait
  // PLUS remonter sa catégorie en tête (Pascal 2026-06-29). Doit rester aligné sur
  // USEFUL_CATEGORIES (lib/aliexpress-categories.ts).
  const ord = (c: string) => { const i = STORE_CATEGORY_ORDER.indexOf(c); return i === -1 ? 999 : i; };
  return [...groups.entries()]
    .map(([category, products]) => ({ category, products }))
    .sort((a, b) => ord(a.category) - ord(b.category) || a.category.localeCompare(b.category));
}

// Ordre d'affichage fixe des catégories Boutique (mode d'abord). Aligné sur
// USEFUL_CATEGORIES — gardé ici en dur pour éviter un cycle d'import vers lib/db.
const STORE_CATEGORY_ORDER: string[] = [
  'Vêtements pour femmes', 'Vêtements pour hommes', 'Chaussures', 'Vêtements et accessoires',
  'Sous-vêtements', 'Bijoux et accessoires', 'Montres', 'Baggages et sacs',
  'Beauté et santé', 'Accessoires pour vêtements', 'Extensions de cheveux et perruques',
  'Mère et enfants', 'Téléphones et télécommunications', 'Accessoires pour téléphones et télécommunications',
  'Maison et jardin', 'Appareils ménagers', 'Sports et loisirs',
  'Chaussures, vêtements et accessoires de sport', 'Jouets et loisirs', 'Meubles', 'Outils',
  'Automobiles, pièces et accessoires', 'Lumières et éclairage', 'Mariages et événements',
  'Fournitures bureau et scolaires', 'Sécurité et protection', "Amélioration de l'habitat",
  'Ordinateur et bureautique',
];

/** Liste plate du catalogue (pour Léa : elle ne propose QUE ça). */
export function getStoreProductsFlat(limit = 500): StoreProduct[] {
  return getStoreCatalog().flatMap((g) => g.products).slice(0, limit);
}

/** Card brute (id + attached_product_json) — pour enrichir le détail produit. */
export function getRawCardProduct(cardId: string): { id: string; product: Record<string, unknown> | null } | null {
  // Catalogue Shop dans shop.db (base dédiée) ; sinon produit attaché à une
  // card perso → direct_cards (base principale).
  const row = (getShopDb().prepare('SELECT id, attached_product_json FROM shop_products WHERE id = ?').get(cardId)
    || getDb().prepare('SELECT id, attached_product_json FROM direct_cards WHERE id = ?').get(cardId)) as
    | { id: string; attached_product_json: string | null }
    | undefined;
  if (!row) return null;
  let product: Record<string, unknown> | null = null;
  try {
    product = row.attached_product_json ? (JSON.parse(row.attached_product_json) as Record<string, unknown>) : null;
  } catch {
    product = null;
  }
  return { id: row.id, product };
}

/** Fusionne un patch dans le produit attaché d'une card (ex: description, sizes). */
export function patchCardProduct(cardId: string, patch: Record<string, unknown>): void {
  const cur = getRawCardProduct(cardId);
  if (!cur) return;
  const merged = JSON.stringify({ ...(cur.product || {}), ...patch });
  // Produit catalogue → shop.db ; sinon card perso → base principale.
  const r = getShopDb().prepare('UPDATE shop_products SET attached_product_json = ? WHERE id = ?').run(merged, cardId);
  if (!r.changes) {
    getDb().prepare('UPDATE direct_cards SET attached_product_json = ? WHERE id = ?').run(merged, cardId);
  }
}

// ===================== P2 — Matrice de post unifiée (double écriture) =====================
// Déduit le post_type d'une direct_card (markers cachés dans caption).
function unifiedPostType(c: { type?: string | null; caption?: string | null }): string {
  const cap = c.caption || '';
  if (/\[VITRINE:[^\]]+\]/.test(cap)) return 'vitrine';
  if (cap.includes('[PIECE3D]')) return 'piece3d';
  if (cap.includes('[LEA360]')) return 'lea360';
  return c.type || 'image';
}

const UNIFIED_COLS = '(source,id,user_id,post_type,conversation_id,message_ids,media_url,caption,text,bg_variant,attached_audio_json,attached_product_json,boutique_id,category,ad_listed_at,ad_city,likes,views,share_count,save_count,comment_count,order_position,metadata_map,boosted_until,archived_at,deleted_at,created_at)';

/** Miroir d'une direct_card → unified_posts. Best-effort (n'interrompt jamais le flux). */
export function mirrorDirectCardToUnified(row: Record<string, unknown>): void {
  try {
    getDb().prepare(
      `INSERT OR REPLACE INTO unified_posts ${UNIFIED_COLS} VALUES ('direct_card', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.user_id, unifiedPostType(row as { type?: string | null; caption?: string | null }),
      row.media_url ?? null, row.caption ?? null, row.text ?? null, row.bg_variant ?? null,
      row.attached_audio_json ?? null, row.attached_product_json ?? null, row.boutique_id ?? null,
      row.category ?? null, row.ad_listed_at ?? null, row.ad_city ?? null,
      row.likes ?? 0, row.views ?? 0, row.share_count ?? 0, row.save_count ?? 0, row.comment_count ?? 0,
      row.order_position ?? null, row.metadata_map ?? null, row.boosted_until ?? null,
      row.archived_at ?? null, row.deleted_at ?? null, row.created_at
    );
  } catch (e) { console.warn('[unified] mirror direct_card', e); }
}

/** Miroir d'un post (chat) → unified_posts. Best-effort. */
export function mirrorPostToUnified(row: Record<string, unknown>): void {
  try {
    getDb().prepare(
      `INSERT OR REPLACE INTO unified_posts ${UNIFIED_COLS} VALUES ('post', ?, ?, 'chat', ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.user_id, row.conversation_id ?? null, row.message_ids ?? null,
      row.attached_audio_json ?? null,
      row.likes ?? 0, row.views ?? 0, row.share_count ?? 0, row.save_count ?? 0, row.comment_count ?? 0,
      row.order_position ?? null, row.metadata_map ?? null, row.boosted_until ?? null,
      row.archived_at ?? null, row.deleted_at ?? null, row.created_at
    );
  } catch (e) { console.warn('[unified] mirror post', e); }
}

/** Backfill one-shot : recopie posts + direct_cards existants dans unified_posts. */
export function backfillUnifiedPosts(): { posts: number; cards: number } {
  const db = getDb();
  const cards = db.prepare('SELECT * FROM direct_cards').all() as Record<string, unknown>[];
  for (const c of cards) mirrorDirectCardToUnified(c);
  const posts = db.prepare('SELECT * FROM posts').all() as Record<string, unknown>[];
  for (const p of posts) mirrorPostToUnified(p);
  return { posts: posts.length, cards: cards.length };
}

export function createDirectCard(
  userId: string,
  input: CreateDirectCardInput,
): DbDirectCard {
  if (!userId) throw new Error('userId required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, attached_audio_json, attached_product_json, boutique_id, category, ad_listed_at, ad_city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    userId,
    input.type,
    input.media_url ?? null,
    input.caption ?? null,
    input.text ?? null,
    input.bg_variant ?? null,
    input.attached_audio_json ?? null,
    input.attached_product_json ?? null,
    input.boutique_id ?? null,
    input.category ?? null,
    typeof input.ad_listed_at === 'number' ? input.ad_listed_at : null,
    input.ad_city ?? null,
    now
  );
  const row = db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(id) as any;
  const parsed = parseDirectCardRow(row);

  // P2 — double écriture dans la matrice unifiée (best-effort, non bloquant).
  mirrorDirectCardToUnified(row as Record<string, unknown>);

  // Talk2Me #402 — Indexation référencement (Pascal 2026-06-05). Best-effort.
  try {
    const map = metadataMapFromDirectMedia({
      type: parsed.type,
      caption: parsed.caption,
      text: parsed.text,
      media_url: parsed.media_url,
    });
    indexCardSafely('direct_card', parsed.id, map);
  } catch (e) {
    console.warn('[createDirectCard] indexing skipped', parsed.id, e);
  }

  return parsed;
}

/** Card OS : stocke le `.card` sérialisé (source de vérité lue par le feed). */
export function setCardDotcard(id: string, dotcard: string): void {
  try { getDb().prepare('UPDATE direct_cards SET dotcard = ? WHERE id = ?').run(dotcard, id); } catch { /* colonne absente / id inconnu */ }
}

/** Card OS — UPGRADE : convertit les anciens posts (sans `.card`) en `.card`.
 * Idempotent (ne touche que dotcard IS NULL). Renvoie {converted, remaining}. */
export function backfillDotcards(batch = 500): { converted: number; remaining: number } {
  const db = getDb();
  let rows: any[] = [];
  try {
    rows = db.prepare('SELECT * FROM direct_cards WHERE dotcard IS NULL LIMIT ?').all(batch) as any[];
  } catch { return { converted: 0, remaining: 0 }; }
  const upd = db.prepare('UPDATE direct_cards SET dotcard = ? WHERE id = ?');
  let converted = 0;
  for (const r of rows) {
    try { upd.run(serializeCard(cardFromDirectCard(r)), r.id); converted++; } catch { /* skip ligne foireuse */ }
  }
  let remaining = 0;
  try { remaining = (db.prepare('SELECT COUNT(*) c FROM direct_cards WHERE dotcard IS NULL').get() as { c: number }).c; } catch { /* */ }
  return { converted, remaining };
}

/**
 * Card OS — "ON PART PROPRE" (Pascal 2026-06-30). WIPE DUR du FEED. Le feed lit DEUX
 * sources (cf getMixedFeedRankedPage : `posts` UNION `direct_cards`) → on vide LES DEUX.
 *
 * PÉRIMÈTRE — ce qui est SUPPRIMÉ :
 *   • direct_cards WHERE boutique_id IS NULL  (cards image/video/texte du composer)
 *   • posts  (clips de conversation publiés au feed)
 *   • unified_posts (miroirs des deux) + card_likes / card_comments correspondants
 *
 * CE QUI EST PRÉSERVÉ (intact) : users, boutiques, PRODUITS de boutique
 * (direct_cards à boutique_id non nul), brouillons (table drafts), CONVERSATIONS et
 * MESSAGES (posts ne stocke que des références, pas les messages). Irréversible. Super-admin.
 */
export function wipeFeed(): { cards: number; posts: number; unified: number; likes: number; comments: number } {
  const db = getDb();
  const subDc = '(SELECT id FROM direct_cards WHERE boutique_id IS NULL)';
  const count = (sql: string) => {
    try { return (db.prepare(sql).get() as { c: number }).c; } catch { return 0; }
  };
  const cards = count('SELECT COUNT(*) c FROM direct_cards WHERE boutique_id IS NULL');
  const posts = count('SELECT COUNT(*) c FROM posts');
  const unified = count(`SELECT COUNT(*) c FROM unified_posts WHERE (source='direct_card' AND id IN ${subDc}) OR source='post'`);
  const likes = count(`SELECT COUNT(*) c FROM card_likes WHERE (card_kind='direct_card' AND card_id IN ${subDc}) OR card_kind='post'`);
  const comments = count(`SELECT COUNT(*) c FROM card_comments WHERE (card_kind='direct_card' AND card_id IN ${subDc}) OR card_kind='post'`);
  const tx = db.transaction(() => {
    // dépendances d'abord (sous-requêtes sur direct_cards/posts), PUIS les tables sources.
    try { db.prepare(`DELETE FROM card_comments WHERE (card_kind='direct_card' AND card_id IN ${subDc}) OR card_kind='post'`).run(); } catch { /* table absente */ }
    try { db.prepare(`DELETE FROM card_likes WHERE (card_kind='direct_card' AND card_id IN ${subDc}) OR card_kind='post'`).run(); } catch { /* table absente */ }
    try { db.prepare(`DELETE FROM unified_posts WHERE (source='direct_card' AND id IN ${subDc}) OR source='post'`).run(); } catch { /* table absente */ }
    db.prepare('DELETE FROM direct_cards WHERE boutique_id IS NULL').run();
    try { db.prepare('DELETE FROM posts').run(); } catch { /* table absente */ }
  });
  tx();
  return { cards, posts, unified, likes, comments };
}

/** Card OS diag : couverture `.card` des cards du feed (hors boutique). */
export function countFeedCards(): { total: number; withCard: number } {
  const db = getDb();
  const g = (sql: string) => { try { return (db.prepare(sql).get() as { c: number }).c; } catch { return 0; } };
  return {
    total: g('SELECT COUNT(*) c FROM direct_cards WHERE boutique_id IS NULL'),
    withCard: g("SELECT COUNT(*) c FROM direct_cards WHERE boutique_id IS NULL AND dotcard IS NOT NULL AND dotcard <> ''"),
  };
}

/**
 * Éditeur Card (Phase 2) : modifie le TEXTE d'une card feed, PROPRIÉTAIRE uniquement.
 * Écrit dans la SOURCE (colonne réelle caption/text), PUIS re-sérialise le `.card`
 * (source de vérité) → tous les lecteurs reflètent le changement. Zéro édition du cache seul.
 */
/**
 * Éditeur Card (Phase 2) : modifie plusieurs RAYONS d'une card feed, PROPRIÉTAIRE only.
 * Écrit la SOURCE (colonnes réelles) PUIS re-sérialise le `.card` → tous les lecteurs suivent.
 * Champs éditables : text (légende), category, media_url (image, /uploads/ uniquement).
 */
export function updateDirectCardFields(
  id: string,
  userId: string,
  patch: { text?: string; category?: string; media_url?: string }
): DbDirectCard | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM direct_cards WHERE id = ? AND user_id = ?').get(id, userId) as
    (Record<string, unknown> & { type?: string }) | undefined;
  if (!row) return null;
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (patch.text !== undefined) {
    const col = row.type === 'texte' ? 'text' : 'caption';
    sets.push(`${col} = ?`); vals.push(patch.text.trim().slice(0, 200) || null);
  }
  if (patch.category !== undefined) {
    sets.push('category = ?'); vals.push(patch.category.trim().slice(0, 60) || null);
  }
  if (patch.media_url !== undefined && typeof patch.media_url === 'string' && patch.media_url.startsWith('/uploads/')) {
    sets.push('media_url = ?'); vals.push(patch.media_url);
  }
  if (sets.length) db.prepare(`UPDATE direct_cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  const updated = db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(id) as DbDirectCard;
  try { setCardDotcard(id, serializeCard(cardFromDirectCard(updated))); } catch { /* re-sérialisation best-effort */ }
  return updated;
}

/** Rétrocompat : édition du seul texte. */
export function updateDirectCardText(id: string, userId: string, value: string): DbDirectCard | null {
  return updateDirectCardFields(id, userId, { text: value });
}

/** Inspecteur : ligne brute d'une card pour l'inspection (dotcard + méta d'identité). */
export function getCardInspectRow(id: string): { id: string; user_id: string; type: string; created_at: number; dotcard: string | null } | null {
  try {
    return (getDb().prepare('SELECT id, user_id, type, created_at, dotcard FROM direct_cards WHERE id = ?').get(id) as
      { id: string; user_id: string; type: string; created_at: number; dotcard: string | null } | undefined) || null;
  } catch { return null; }
}

export function getDirectCards(limit = 50, offset = 0): DbDirectCard[] {
  const db = getDb();
  // Lot A : exclut soft-deleted ET archivées du feed public.
  // Talk2Me #428 : exclut AUSSI les articles rangés dans une boutique
  // (boutique_id non nul) — ils vivent UNIQUEMENT dans leur vitrine, pas dans le
  // feed social du Hub (sinon les emplacements/produits polluent le Hub).
  const rows = db
    .prepare(
      'SELECT * FROM direct_cards WHERE deleted_at IS NULL AND archived_at IS NULL AND boutique_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .all(limit, offset) as any[];
  return rows.map(parseDirectCardRow);
}

