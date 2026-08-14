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
import { convertV1toV2 } from '@/lib/cards/v2/convert';
import { validateCard } from '@/lib/cards/v2/validate';
import { hasContactLeak } from '@/lib/cards/contact-guard';
import { publishCard } from '@/lib/cards/engine/publish';

// Rempart ARGENT/PII à l'écriture (chantier .card, Pascal 2026-07-21). Les cartes spec:2 sont
// bloquées EN DUR par writeCardFile ; les écritures legacy (setCardDotcard) passent ici : on
// convertit + valide et on ALERTE (loud, non-bloquant) sur toute violation argent (non-MGA /
// non-entier / centimes) ou PII (owner/payee/ref non-opaque). Non-bloquant = zéro régression ;
// prouvé silencieux sur 50 vraies cartes (0 violation). Durcissable en throw une fois les logs
// confirmés propres en usage réel.
const MONEY_RE = /argent|MGA|devise|amount|entier ≥|centimes/i;
const PII_RE = /PII|opaque/i;
function auditCardMoneyPII(dotcard: string, id: string): void {
  try {
    // Anti-désintermédiation : un numéro glissé dans le texte libre → on SIGNALE (masqué à l'affichage).
    if (hasContactLeak(dotcard)) {
      console.warn(`[card-guard] NUMÉRO dans le texte (désintermédiation) card=${id} — masqué à l'affichage`);
    }
    const v = validateCard(convertV1toV2(JSON.parse(dotcard)));
    if (v.ok) return;
    const sensitive = v.errors.filter((e) => MONEY_RE.test(e.message) || PII_RE.test(e.message));
    if (sensitive.length) {
      console.warn(`[card-guard] VIOLATION argent/PII à l'écriture card=${id} :`,
        sensitive.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join(' ; '));
    }
  } catch { /* best-effort : jamais faire échouer l'écriture pour l'audit */ }
}

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
  /** LOT 2 racine posts — sous-type robuste dérivé (colonne direct_cards.post_type, ALTER+trigger db-core). */
  post_type?: string | null;
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

/** #74 — La card VITRINE (direct_card, marqueur [VITRINE:shopId]) d'une boutique du
 *  propriétaire, pour la booster. C'est CETTE card qui remonte au feed quand on la boost. */
export function getVitrineCard(userId: string, shopId: string): { id: string; boosted_until: number | null } | null {
  if (!userId || !shopId) return null;
  const row = getDb()
    .prepare("SELECT id, boosted_until FROM direct_cards WHERE user_id = ? AND caption LIKE ? AND deleted_at IS NULL LIMIT 1")
    .get(userId, `%[VITRINE:${shopId}]%`) as { id: string; boosted_until: number | null } | undefined;
  return row ? { id: row.id, boosted_until: typeof row.boosted_until === 'number' ? row.boosted_until : null } : null;
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

  // Card OS : toute card NAÎT avec son `.card` (dotcard) — sinon le feed la juge « illisible »
  // (il ne bricole jamais un rendu). Best-effort. Pascal 2026-07-08.
  // On calcule le `.card` UNE fois : source de vérité pour l'écriture ET l'index (recherche v2).
  let dotcard: ReturnType<typeof cardFromDirectCard> | null = null;
  try {
    dotcard = cardFromDirectCard(parsed);
    setCardDotcard(id, serializeCard(dotcard));
  } catch {
    /* re-sérialisation best-effort */
  }

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
    // rawCard = le `.card` (source de vérité) → recherche v2 (flaggée, additive).
    indexCardSafely('direct_card', parsed.id, map, dotcard ?? undefined);
  } catch (e) {
    console.warn('[createDirectCard] indexing skipped', parsed.id, e);
  }

  // Page-entité vivante (Pascal 2026-07-08) — best-effort, JAMAIS bloquant : peuple la couche
  // ENTITÉ (dédup par entity_key + contributeur attribué). Le feed garde ses N posts sociaux ;
  // c'est la couche entité qui converge (2 partages du même son → 1 entité, 2 contributeurs).
  try {
    publishCard(cardFromDirectCard(parsed), userId);
  } catch (e) {
    console.warn('[createDirectCard] entity publish skipped', parsed.id, e);
  }

  return parsed;
}

/** Card OS : stocke le `.card` sérialisé (source de vérité lue par le feed). */
export function setCardDotcard(id: string, dotcard: string): void {
  auditCardMoneyPII(dotcard, id); // rempart argent/PII (loud, non-bloquant) sur le chemin legacy
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

// wipeFeed() + countFeedCards() SUPPRIMÉS (Pascal 2026-08-14) : plus de wipe du feed exposé en
// code/HTTP. Vider le feed = ligne de commande uniquement (SQL/node direct sur data/talktome.db).

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
/** Audit structurel (Pascal 2026-07-11) : les cards les plus RÉCENTES, pour vérifier que chacune
 *  a bien un fichier `.card` conforme (un lecteur ne lit QUE des .card). */
export function getRecentCardRows(limit = 100): { id: string; user_id: string; type: string; created_at: number }[] {
  try {
    return (getDb()
      .prepare('SELECT id, user_id, type, created_at FROM direct_cards WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?')
      .all(limit) as { id: string; user_id: string; type: string; created_at: number }[]) || [];
  } catch { return []; }
}

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

