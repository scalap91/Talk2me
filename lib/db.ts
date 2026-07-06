// /lib/db.ts (monolithic — Pascal 2026-06-05 #401)
// Restauré du split #397 pour fixer le tree-shaking Turbopack qui éliminait
// silencieusement updatePresence/getPresences/getOrCreateAgentConversation.
// Les fichiers source restent dans /lib/db/<module>.ts pour navigation.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { ensureApiKeysTable, applyApiKeysToEnv } from '@/lib/api-keys';
import { getShopDb } from '@/lib/shop-db';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import { randomUUID, randomBytes } from 'crypto';
import type { Activity, ActivityKind } from '@/lib/activity-types';
// Talk2Me #402 — Référencement cards. Import lib/search pour indexer les
// metadata YouTube/Spotify/TikTok/article au moment du createPost
// + createDirectCard. Voir doctrine modular-no-scattered-patches.
import type { CardMetadataMap } from '@/lib/search/metadata-map';
import {
  extractCardMetadata,
  metadataMapFromDirectMedia,
  metadataMapFromText,
  searchableFromMap,
  extractHashtagsFromText,
} from '@/lib/search/metadata-map';


// ============ _core ============ EXTRAIT dans lib/db-core.ts (decoupage db-core, Pascal 2026-06-30).
// Socle (getDb, init schema, types Db*, parsers parse*, DbUser) deplace dans lib/db-core.
// db.ts re-exporte le socle (facade) -> appelants from '@/lib/db' inchanges.
export * from './db-core';
import type {
  CreateUserInput, DbMessageMedia, DbPlace, DbProduct, DbRecipe, DbTiktok,
  DbUser, DbWeather, DbWebSearch, DbWikipedia, DbYoutube,
} from './db-core';
import {
  getDb, parseAttachedCards, parseJsonArray, parseMedia, parsePlaces,
  parseProducts, parseRecipe, parseTiktok, parseUserRow, parseWeather,
  parseWebSearch, parseWikipedia, parseYoutube,
} from './db-core';

// ============ users ============ EXTRAIT dans lib/db-users.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-users';
import { getUserById } from './db-users';
// ============ sessions ============ EXTRAIT dans lib/db-sessions.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-sessions';
// ============ conversations ============ EXTRAIT dans lib/db-conversations.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-conversations';
// ============ conversation_participants ============
// /lib/db/conversation_participants.ts — La table conversation_participants
// n'a actuellement pas d'API publique dédiée : les inserts et lectures se
// font à l'intérieur des helpers de conversations.ts (getOrCreate*, createP2P,
// listUserConversations, etc.) qui maintiennent l'invariant participants.
//
// Le fichier existe pour respecter le plan de split et accueillir des futurs
// helpers (ex : listParticipants(convId), addParticipant pour les conv group,
// etc.) sans devoir re-toucher conversations.ts.

export {};

// ============ messages ============ EXTRAIT dans lib/db-messages.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-messages';
import { parseMessageRow } from './db-messages';
import type { DbMessage } from './db-messages';
// ============ friendships ============ EXTRAIT dans lib/db-friendships.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-friendships';
// ============ direct_cards ============ EXTRAIT dans lib/db-direct-cards.ts (decoupage #53, Pascal 2026-06-30).
export * from './db-direct-cards';
import { createDirectCard, getDirectCards, mirrorPostToUnified, parseDirectCardRow } from './db-direct-cards';
import type { DbDirectCard } from './db-direct-cards';
// ============ posts ============ EXTRAIT dans lib/db-posts.ts (Feed) + db-commerce.ts (Shop) + db-drive.ts (Drive/Comm) — sous-decoupage #53, Pascal 2026-06-30.
export * from './db-posts';
export * from './db-commerce';
export * from './db-drive';
import { extractPostPreview, getUserPublishedCards } from './db-posts';
import type { PublishedCardItem } from './db-posts';
// ============ cards_common ============
// /lib/db/cards_common.ts — Helpers CRUD communs aux 2 tables direct_cards
// + posts (soft-delete, archive, restore, reorder, likes, views, trash,
// ownership). Doctrine [[talk2me-card-vivante]] + master prompt point 14.


export type CardKindForCrud = 'direct_card' | 'post';

export const VALID_CARD_KINDS_FOR_CRUD: CardKindForCrud[] = [
  'direct_card',
  'post',
];

/** Petit helper interne : nom de la table SQL pour un card_kind donné. */
function _tableForCardKind(kind: CardKindForCrud): 'direct_cards' | 'posts' {
  return kind === 'direct_card' ? 'direct_cards' : 'posts';
}

/**
 * Soft-delete d'une card (direct_card ou post). Set `deleted_at = now`.
 * Vérifie l'ownership : seul le propriétaire peut supprimer.
 * Retourne true si une ligne a été modifiée, false sinon (not found / pas
 * owner / déjà supprimée).
 */
export function softDeleteCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE ${table} SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .run(now, cardId, userId);
  return r.changes > 0;
}

/**
 * Soft-delete ADMIN : supprime N'IMPORTE QUEL post/card sans contrainte d'owner.
 * Réservé au super-admin (vérifié côté route via isAiOpsAdmin). Pour la croix de
 * modération en mode admin sur le feed (Pascal 2026-06-12).
 */
export function adminSoftDeleteCard(kind: CardKindForCrud, cardId: string): boolean {
  if (!cardId) return false;
  const table = _tableForCardKind(kind);
  const r = getDb()
    .prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .run(Date.now(), cardId);
  return r.changes > 0;
}

/**
 * Restore une card soft-deleted dans la fenêtre `windowDays` (défaut 30).
 * Vérifie l'ownership + que la deletion est récente.
 */
export function restoreCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string,
  windowDays: number = 30
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const r = db
    .prepare(
      `UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?`
    )
    .run(cardId, userId, cutoff);
  return r.changes > 0;
}

/**
 * Hard-delete d'une card (suppression définitive). Réservé à la page /trash
 * ("Supprimer définitivement"). Vérifie l'ownership.
 * Supprime aussi les likes orphelins (card_likes pour ce kind+id).
 */
export function hardDeleteCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const tx = db.transaction(() => {
    const r = db
      .prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`)
      .run(cardId, userId);
    if (r.changes > 0) {
      db.prepare(
        'DELETE FROM card_likes WHERE card_kind = ? AND card_id = ?'
      ).run(kind, cardId);
    }
    return r.changes > 0;
  });
  return tx();
}

/** Restore ADMIN (sans contrainte d'owner) — modération feed. Fenêtre 30j. */
export function adminRestoreCard(kind: CardKindForCrud, cardId: string, windowDays = 30): boolean {
  if (!cardId) return false;
  const table = _tableForCardKind(kind);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const r = getDb()
    .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?`)
    .run(cardId, cutoff);
  return r.changes > 0;
}

/** Hard-delete ADMIN (sans contrainte d'owner) — suppression définitive modération. */
export function adminHardDeleteCard(kind: CardKindForCrud, cardId: string): boolean {
  if (!cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const tx = db.transaction(() => {
    const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(cardId);
    if (r.changes > 0) {
      db.prepare('DELETE FROM card_likes WHERE card_kind = ? AND card_id = ?').run(kind, cardId);
    }
    return r.changes > 0;
  });
  return tx();
}

/** Archive une card (set `archived_at = now`). Vérifie ownership. */
export function archiveCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE ${table} SET archived_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL AND deleted_at IS NULL`
    )
    .run(now, cardId, userId);
  return r.changes > 0;
}

/** Désarchive une card. Vérifie ownership. */
export function unarchiveCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE ${table} SET archived_at = NULL WHERE id = ? AND user_id = ? AND archived_at IS NOT NULL`
    )
    .run(cardId, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #383 (Pascal 2026-06-05) — Réordonne une card (drag & drop).
 * Set `order_position = newPosition` (entier, peut être négatif/grand,
 * comparé par ASC). Vérifie ownership. Pas de réindexation globale : on
 * laisse SQLite trier sur la valeur brute, ce qui permet d'insérer entre
 * deux positions (cf trick "fractional indexing" : ici on utilise des
 * positions arbitraires 0..N-1 réécrites par lot par l'UI).
 */
export function reorderCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string,
  newPosition: number
): boolean {
  if (!userId || !cardId) return false;
  if (!Number.isFinite(newPosition)) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE ${table} SET order_position = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .run(Math.floor(newPosition), cardId, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #383 — Détecte le kind d'une card par lookup dans les 2 tables.
 * Retourne le kind si trouvé ET appartient à userId, sinon null.
 * Utilisé par POST /api/cards/[id]/reorder pour autoriser un body { position }
 * sans que le client n'ait à connaître/envoyer le kind.
 */
export function detectCardKindForOwner(
  userId: string,
  cardId: string
): CardKindForCrud | null {
  if (!userId || !cardId) return null;
  const db = getDb();
  const dc = db
    .prepare(
      'SELECT 1 FROM direct_cards WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1'
    )
    .get(cardId, userId);
  if (dc) return 'direct_card';
  const p = db
    .prepare(
      'SELECT 1 FROM posts WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1'
    )
    .get(cardId, userId);
  if (p) return 'post';
  return null;
}

/**
 * Talk2Me #383 — Réordonne en BATCH plusieurs cards (transaction atomique).
 * `items` = liste [{ kind, id, position }]. Toutes les cards doivent
 * appartenir à userId. Retourne le nombre d'updates effectives.
 *
 * Usage typique côté UI : après un drag, on recalcule les positions 0..N-1
 * de toutes les cards visibles et on envoie le batch en 1 POST.
 */
export function reorderCardsBatch(
  userId: string,
  items: Array<{ kind: CardKindForCrud; id: string; position: number }>
): number {
  if (!userId || !Array.isArray(items) || items.length === 0) return 0;
  const db = getDb();
  let updated = 0;
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!it || !it.id || !VALID_CARD_KINDS_FOR_CRUD.includes(it.kind)) continue;
      if (!Number.isFinite(it.position)) continue;
      const table = _tableForCardKind(it.kind);
      const r = db
        .prepare(
          `UPDATE ${table} SET order_position = ?
           WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
        )
        .run(Math.floor(it.position), it.id, userId);
      if (r.changes > 0) updated += 1;
    }
  });
  tx();
  return updated;
}

/**
 * Like idempotent : insert dans card_likes (UNIQUE constraint → no-op si déjà
 * liké) + incrément du compteur `likes` sur la table source.
 * Si la card est soft-deleted/archivée OU inexistante, retourne false.
 */
export function likeCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  // Sanity : la card existe et n'est pas supprimée
  const exists = db
    .prepare(
      `SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL LIMIT 1`
    )
    .get(cardId);
  if (!exists) return false;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        'INSERT OR IGNORE INTO card_likes (id, user_id, card_kind, card_id, liked_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(randomUUID(), userId, kind, cardId, Date.now());
    if (r.changes > 0) {
      db.prepare(`UPDATE ${table} SET likes = likes + 1 WHERE id = ?`).run(
        cardId
      );
      return true;
    }
    return false; // déjà liké
  });
  return tx();
}

/**
 * Unlike idempotent : delete du card_likes + décrément du compteur (clampé >=0).
 * Retourne true si une ligne a été supprimée, false sinon.
 */
export function unlikeCard(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        'DELETE FROM card_likes WHERE user_id = ? AND card_kind = ? AND card_id = ?'
      )
      .run(userId, kind, cardId);
    if (r.changes > 0) {
      db.prepare(
        `UPDATE ${table} SET likes = MAX(0, likes - 1) WHERE id = ?`
      ).run(cardId);
      return true;
    }
    return false;
  });
  return tx();
}

/** Lit le compteur `likes` à jour sur la table source. */
export function readCardLikesCount(
  kind: CardKindForCrud,
  cardId: string
): number {
  if (!cardId) return 0;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const row = db
    .prepare(`SELECT likes FROM ${table} WHERE id = ? LIMIT 1`)
    .get(cardId) as { likes?: number } | undefined;
  return row?.likes ?? 0;
}

/** Vrai si `userId` a liké la card (kind+id). */
export function isLikedByUser(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const db = getDb();
  const row = db
    .prepare(
      'SELECT 1 FROM card_likes WHERE user_id = ? AND card_kind = ? AND card_id = ? LIMIT 1'
    )
    .get(userId, kind, cardId);
  return !!row;
}

/**
 * Retourne la liste des couples (card_kind, card_id) likés par `userId` parmi
 * un ensemble de candidats. Utilisé par le feed pour hydrater le badge ❤️
 * en un seul SELECT au lieu de N.
 */
export function getLikedCardIds(
  userId: string,
  candidates: Array<{ kind: CardKindForCrud; id: string }>
): Set<string> {
  const out = new Set<string>();
  if (!userId || candidates.length === 0) return out;
  const db = getDb();
  const placeholders = candidates.map(() => '(?, ?)').join(',');
  const args: string[] = [];
  for (const c of candidates) {
    args.push(c.kind, c.id);
  }
  const rows = db
    .prepare(
      `SELECT card_kind, card_id FROM card_likes
         WHERE user_id = ?
           AND (card_kind, card_id) IN (VALUES ${placeholders})`
    )
    .all(userId, ...args) as Array<{ card_kind: string; card_id: string }>;
  for (const r of rows) {
    out.add(`${r.card_kind}:${r.card_id}`);
  }
  return out;
}

/**
 * Talk2Me #411 — Cards likées par un user, sous le même format que
 * getUserPublishedCards (PublishedCardItem). Ordre = date de like DESC.
 */
export function getUserLikedCards(
  userId: string,
  limit = 50,
  offset = 0
): PublishedCardItem[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));

  const likeRows = db
    .prepare(
      `SELECT card_kind, card_id, liked_at FROM card_likes
         WHERE user_id = ?
         ORDER BY liked_at DESC
         LIMIT ? OFFSET ?`
    )
    .all(userId, n, off) as Array<{ card_kind: string; card_id: string; liked_at: number }>;

  if (!likeRows.length) return [];

  const directIds = likeRows.filter((r) => r.card_kind === 'direct_card').map((r) => r.card_id);
  const postIds = likeRows.filter((r) => r.card_kind === 'post').map((r) => r.card_id);

  const items: PublishedCardItem[] = [];

  if (directIds.length) {
    const placeholders = directIds.map(() => '?').join(',');
    const dcRows = db
      .prepare(
        `SELECT * FROM direct_cards
         WHERE id IN (${placeholders})
           AND deleted_at IS NULL AND archived_at IS NULL`
      )
      .all(...directIds) as any[];
    for (const r of dcRows) {
      const card = parseDirectCardRow(r);
      const previewText =
        card.caption && card.caption.trim().length > 0
          ? card.caption.trim().slice(0, 200)
          : card.text && card.text.trim().length > 0
            ? card.text.trim().slice(0, 200)
            : null;
      items.push({
        id: card.id,
        card_kind: 'direct_card',
        type: card.type,
        thumbnail_url: card.type === 'texte' ? null : card.media_url,
        title:
          card.caption && card.caption.trim().length > 0
            ? card.caption.trim().slice(0, 80)
            : card.text && card.text.trim().length > 0
              ? card.text.trim().slice(0, 80)
              : null,
        preview_text: previewText,
        published_at: card.created_at,
        like_count: card.likes,
        view_count: card.views,
        order_position: null,
      });
    }
  }

  if (postIds.length) {
    const placeholders = postIds.map(() => '?').join(',');
    const postRows = db
      .prepare(
        `SELECT * FROM posts
         WHERE id IN (${placeholders})
           AND deleted_at IS NULL AND archived_at IS NULL`
      )
      .all(...postIds) as any[];

    const allMessageIds: string[] = [];
    const postMessageIdsMap = new Map<string, string[]>();
    for (const p of postRows) {
      const ids = parseJsonArray(p.message_ids);
      postMessageIdsMap.set(p.id, ids);
      allMessageIds.push(...ids);
    }
    const messageMap = new Map<string, DbMessage>();
    if (allMessageIds.length > 0) {
      const uniq = [...new Set(allMessageIds)];
      const ph2 = uniq.map(() => '?').join(',');
      const msgs = db
        .prepare(`SELECT * FROM messages WHERE id IN (${ph2})`)
        .all(...uniq) as any[];
      for (const m of msgs) messageMap.set(m.id, parseMessageRow(m));
    }

    for (const p of postRows) {
      const ids = postMessageIdsMap.get(p.id) || [];
      const orderedMessages = ids
        .map((id) => messageMap.get(id))
        .filter((m): m is DbMessage => m !== undefined);
      const { preview_text, thumbnail_url } = extractPostPreview({
        id: p.id,
        user_id: p.user_id,
        conversation_id: p.conversation_id,
        message_ids: ids,
        created_at: p.created_at,
        likes: p.likes,
        views: p.views,
        messages: orderedMessages,
      });
      items.push({
        id: p.id,
        card_kind: 'post',
        type: 'conv_clip',
        thumbnail_url,
        title: preview_text ? preview_text.slice(0, 80) : null,
        preview_text,
        published_at: p.created_at,
        like_count: p.likes ?? 0,
        view_count: p.views ?? 0,
        order_position: null,
      });
    }
  }

  // Réordonner par date de like (likeRows est dans le bon ordre)
  const idToLikedAt = new Map<string, number>();
  for (const r of likeRows) idToLikedAt.set(`${r.card_kind}:${r.card_id}`, r.liked_at);
  items.sort((a, b) => {
    const la = idToLikedAt.get(`${a.card_kind}:${a.id}`) || 0;
    const lb = idToLikedAt.get(`${b.card_kind}:${b.id}`) || 0;
    return lb - la;
  });

  return items;
}

/** Vérifie l'ownership (true si la card existe et user_id matche). */
export function isCardOwner(
  userId: string,
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!userId || !cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`)
    .get(cardId, userId);
  return !!row;
}

/**
 * Increment du compteur vues d'une card (instagram-style — pas user-tracé,
 * juste un compteur). Appelé par le front quand la card est visible >2s.
 */
export function incrementCardViews(
  kind: CardKindForCrud,
  cardId: string,
  by: number = 1
): boolean {
  if (!cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE ${table} SET views = views + ? WHERE id = ? AND deleted_at IS NULL`
    )
    .run(Math.max(1, Math.floor(by)), cardId);
  return r.changes > 0;
}

/** Increment compteur share. */
export function incrementCardShareCount(
  kind: CardKindForCrud,
  cardId: string
): boolean {
  if (!cardId) return false;
  const table = _tableForCardKind(kind);
  const db = getDb();
  try {
    const r = db
      .prepare(
        `UPDATE ${table} SET share_count = COALESCE(share_count, 0) + 1 WHERE id = ? AND deleted_at IS NULL`
      )
      .run(cardId);
    return r.changes > 0;
  } catch {
    return false;
  }
}

// ===================== Card trash =====================

export interface TrashCardItem {
  card_kind: CardKindForCrud;
  id: string;
  type: 'image' | 'video' | 'texte' | 'conv_clip';
  thumbnail_url: string | null;
  title: string | null;
  preview_text: string | null;
  deleted_at: number;
  expires_at: number; // = deleted_at + 30j
  like_count: number;
  view_count: number;
}

/**
 * Liste les cards soft-deleted d'un user dans la fenêtre `windowDays` (défaut
 * 30 jours). Mélange direct_cards + posts. Trié par deleted_at DESC.
 */
export function getCardTrash(
  userId: string,
  windowDays: number = 30,
  adminAll: boolean = false
): TrashCardItem[] {
  if (!adminAll && !userId) return [];
  const db = getDb();
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // 1) Direct cards soft-deleted dans la fenêtre
  const dcRows = db
    .prepare(
      adminAll
        ? 'SELECT * FROM direct_cards WHERE deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
        : 'SELECT * FROM direct_cards WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
    )
    .all(...(adminAll ? [cutoff] : [userId, cutoff])) as any[];
  const directItems: TrashCardItem[] = dcRows.map((r) => {
    const c = parseDirectCardRow(r);
    const preview =
      c.caption?.trim().slice(0, 200) || c.text?.trim().slice(0, 200) || null;
    return {
      card_kind: 'direct_card',
      id: c.id,
      type: c.type,
      thumbnail_url: c.type === 'texte' ? null : c.media_url,
      title:
        c.caption?.trim().slice(0, 80) ||
        c.text?.trim().slice(0, 80) ||
        null,
      preview_text: preview,
      deleted_at: r.deleted_at,
      expires_at: r.deleted_at + windowMs,
      like_count: c.likes,
      view_count: c.views,
    };
  });

  // 2) Posts soft-deleted dans la fenêtre
  const postRows = db
    .prepare(
      adminAll
        ? 'SELECT * FROM posts WHERE deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
        : 'SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
    )
    .all(...(adminAll ? [cutoff] : [userId, cutoff])) as any[];

  const allMessageIds: string[] = [];
  const postMessageIdsMap = new Map<string, string[]>();
  for (const p of postRows) {
    const ids = parseJsonArray(p.message_ids);
    postMessageIdsMap.set(p.id, ids);
    allMessageIds.push(...ids);
  }
  const messageMap = new Map<string, DbMessage>();
  if (allMessageIds.length > 0) {
    const uniq = [...new Set(allMessageIds)];
    const placeholders = uniq.map(() => '?').join(',');
    const msgs = db
      .prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`)
      .all(...uniq) as any[];
    for (const m of msgs) messageMap.set(m.id, parseMessageRow(m));
  }

  const postItems: TrashCardItem[] = postRows.map((p) => {
    const ids = postMessageIdsMap.get(p.id) || [];
    const orderedMessages = ids
      .map((id) => messageMap.get(id))
      .filter((m): m is DbMessage => m !== undefined);
    const { preview_text, thumbnail_url } = extractPostPreview({
      id: p.id,
      user_id: p.user_id,
      conversation_id: p.conversation_id,
      message_ids: ids,
      created_at: p.created_at,
      likes: p.likes,
      views: p.views,
      messages: orderedMessages,
    });
    return {
      card_kind: 'post',
      id: p.id,
      type: 'conv_clip',
      thumbnail_url,
      title: preview_text ? preview_text.slice(0, 80) : null,
      preview_text,
      deleted_at: p.deleted_at,
      expires_at: p.deleted_at + windowMs,
      like_count: p.likes ?? 0,
      view_count: p.views ?? 0,
    };
  });

  return [...directItems, ...postItems].sort(
    (a, b) => b.deleted_at - a.deleted_at
  );
}

/**
 * Helper pour récupérer le user_id propriétaire d'une card (utile pour les
 * routes qui ont besoin de check ownership + d'autres infos).
 * Retourne null si introuvable (peu importe deleted_at).
 */
export function getCardOwner(
  kind: CardKindForCrud,
  cardId: string
): { user_id: string; deleted_at: number | null; archived_at: number | null } | null {
  if (!cardId) return null;
  const table = _tableForCardKind(kind);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT user_id, deleted_at, archived_at FROM ${table} WHERE id = ? LIMIT 1`
    )
    .get(cardId) as
    | { user_id: string; deleted_at: number | null; archived_at: number | null }
    | undefined;
  return row ?? null;
}

// ============ saved_cards ============
// EXTRAIT dans ./db-saved-cards (façade #53, Pascal 2026-06-30).
export * from './db-saved-cards';

// ============ habits ============
// EXTRAIT dans ./db-habits (façade #53, Pascal 2026-06-30).
export * from './db-habits';

// ============ memories ============
// EXTRAIT dans ./db-memories (façade #53, Pascal 2026-06-30).
export * from './db-memories';

// ============ route_learnings ============
// EXTRAIT dans ./db-route-learnings (façade #53, Pascal 2026-06-30).
export * from './db-route-learnings';

// ============ drafts ============
// EXTRAIT dans lib/db-drafts.ts (façade #53 démonolithisation, Pascal 2026-06-30).
export * from './db-drafts';

// ============ tutorial ============
// EXTRAIT dans lib/db-tutorial.ts (façade #53 démonolithisation, Pascal 2026-06-30).
// Les appelants importent toujours depuis '@/lib/db' (re-export ci-dessous).
export * from './db-tutorial';

// ============ legal ============
// /lib/db/legal.ts — Legal docs (T2M Officiel IA institutionnelle).
// Doctrine [[talk2me-officiel-ia]].


export interface LegalDocRow {
  topic: string;
  content_md: string;
  updated_at: number;
}

/** Récupère un doc légal par topic. */
export function getLegalDoc(topic: string): LegalDocRow | null {
  if (!topic) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT topic, content_md, updated_at FROM legal_docs WHERE topic = ?')
    .get(topic.trim()) as LegalDocRow | undefined;
  return row || null;
}

// ============ calls v2 ============
// Talk2Me #418 — Tonalité honnête (Pascal 2026-06-05).
// Module appels avec heartbeat ring_beat envoyé par l'appelé. Doctrine
// [[talk2me-calls-architecture]] + [[modular-no-scattered-patches]].

export type CallState =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'ended'
  | 'busy'
  | 'no_answer';

export type CallEndReason =
  | 'caller_hangup'
  | 'callee_hangup'
  | 'declined'
  | 'no_answer'
  | 'busy'
  | 'network_error';

export interface DbCall {
  id: string;
  caller_id: string;
  callee_id: string;
  conv_id: string | null;
  kind: 'audio' | 'video';
  state: CallState;
  started_at: number;
  accepted_at: number | null;
  ended_at: number | null;
  end_reason: CallEndReason | null;
  last_ring_beat_at: number | null;
}

function parseCallRow(row: unknown): DbCall | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    caller_id: r.caller_id as string,
    callee_id: r.callee_id as string,
    conv_id: typeof r.conv_id === 'string' ? r.conv_id : null,
    kind: r.kind === 'video' ? 'video' : 'audio',
    state: (r.state as CallState) || 'ringing',
    started_at: Number(r.started_at) || 0,
    accepted_at: typeof r.accepted_at === 'number' ? r.accepted_at : null,
    ended_at: typeof r.ended_at === 'number' ? r.ended_at : null,
    end_reason: typeof r.end_reason === 'string' ? (r.end_reason as CallEndReason) : null,
    last_ring_beat_at:
      typeof r.last_ring_beat_at === 'number' ? r.last_ring_beat_at : null,
  };
}

/** Crée un nouvel appel state='ringing'. */
export function createCall(input: {
  caller_id: string;
  callee_id: string;
  conv_id?: string | null;
  kind: 'audio' | 'video';
}): DbCall {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO calls (id, caller_id, callee_id, conv_id, kind, state, started_at)
       VALUES (?, ?, ?, ?, ?, 'ringing', ?)`
  ).run(
    id,
    input.caller_id,
    input.callee_id,
    input.conv_id ?? null,
    input.kind,
    now
  );
  return {
    id,
    caller_id: input.caller_id,
    callee_id: input.callee_id,
    conv_id: input.conv_id ?? null,
    kind: input.kind,
    state: 'ringing',
    started_at: now,
    accepted_at: null,
    ended_at: null,
    end_reason: null,
    last_ring_beat_at: null,
  };
}

export function getCallById(callId: string): DbCall | null {
  if (!callId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
  return parseCallRow(row);
}

/** Met à jour last_ring_beat_at. Retourne true si l'appel est encore en 'ringing'. */
export function updateCallRingBeat(callId: string, now: number = Date.now()): boolean {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE calls SET last_ring_beat_at = ?
         WHERE id = ? AND state = 'ringing'`
    )
    .run(now, callId);
  return r.changes > 0;
}

/** Transition ringing → accepted. Idempotent : retourne false si déjà accepted. */
export function acceptCall(callId: string, now: number = Date.now()): boolean {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE calls SET state = 'accepted', accepted_at = ?
         WHERE id = ? AND state = 'ringing'`
    )
    .run(now, callId);
  return r.changes > 0;
}

/** Transition ringing → declined. */
export function declineCall(callId: string, now: number = Date.now()): boolean {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE calls SET state = 'declined', ended_at = ?, end_reason = 'declined'
         WHERE id = ? AND state = 'ringing'`
    )
    .run(now, callId);
  return r.changes > 0;
}

/**
 * Raccrochage. byUserId détermine end_reason :
 *   - byUserId == caller_id  → 'caller_hangup'
 *   - byUserId == callee_id  → 'callee_hangup'
 *   - autre                  → reason custom
 * Tolérant : si call déjà ended, retourne false.
 */
export function hangupCall(
  callId: string,
  byUserId: string,
  reason?: CallEndReason,
  now: number = Date.now()
): { changed: boolean; call: DbCall | null } {
  const db = getDb();
  const call = getCallById(callId);
  if (!call) return { changed: false, call: null };
  if (call.state === 'ended') return { changed: false, call };

  let endReason: CallEndReason =
    reason ||
    (byUserId === call.caller_id
      ? 'caller_hangup'
      : byUserId === call.callee_id
        ? 'callee_hangup'
        : 'network_error');

  const r = db
    .prepare(
      `UPDATE calls SET state = 'ended', ended_at = ?, end_reason = ?
         WHERE id = ? AND state != 'ended'`
    )
    .run(now, endReason, callId);
  if (r.changes === 0) return { changed: false, call };
  return { changed: true, call: { ...call, state: 'ended', ended_at: now, end_reason: endReason } };
}

/** Liste les appels actifs (ringing/accepted) d'un user. */
export function getActiveCallsForUser(userId: string): DbCall[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM calls
         WHERE (caller_id = ? OR callee_id = ?)
           AND state IN ('ringing', 'accepted')
         ORDER BY started_at DESC`
    )
    .all(userId, userId);
  return (rows as unknown[]).map(parseCallRow).filter((c): c is DbCall => c !== null);
}

/** Upsert d'un doc légal (utilisé par le seed). */
export function upsertLegalDoc(topic: string, content_md: string): LegalDocRow {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO legal_docs (topic, content_md, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(topic) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at`,
  ).run(topic, content_md, now);
  return { topic, content_md, updated_at: now };
}







