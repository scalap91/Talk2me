// /lib/db/posts.ts — Table posts (clips de conversation publiés) + auteurs +
// feed mixte posts/direct_cards + recherche + top metrics + buzz.

import { randomUUID } from 'crypto';
import { getDb, parseJsonArray } from './_core';
import { parseMessageRow, type DbMessage } from './messages';
import {
  parseDirectCardRow,
  getDirectCards,
  type DbDirectCard,
  type DirectCardType,
} from './direct_cards';

// ===================== Types =====================

export interface DbPost {
  id: string;
  user_id: string;
  conversation_id: string;
  message_ids: string[];
  created_at: number;
  likes: number;
  views: number;
}

export interface DbPostWithMessages extends DbPost {
  messages: DbMessage[];
}

/**
 * Talk2Me #378 — Auteur d'une card (post OU direct_card) pour le header
 * affiché sur /home (et tout feed unifié). On expose un sous-ensemble
 * de DbUser pour éviter de leaker email/talk2me_id/ai_name dans l'API
 * publique. `null` possible si l'utilisateur a été supprimé / id orphelin.
 */
export interface PostAuthor {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

export interface DbPostWithMessagesAndAuthor extends DbPostWithMessages {
  author: PostAuthor | null;
}

export interface DbDirectCardWithAuthor extends DbDirectCard {
  author: PostAuthor | null;
}

export interface PostResponseShape {
  id: string;
  createdAt: number;
  likes: number;
  views: number;
  messages: any[];
}

export type FeedItem =
  | ({ kind: 'post' } & PostResponseShape)
  | ({ kind: 'video_card' | 'image_card' | 'texte_card' } & DbDirectCard);

export interface PublishedCardItem {
  id: string;
  /** Lot A : discriminant pour DELETE / archive / restore via /api/cards/[id]. */
  card_kind: 'direct_card' | 'post';
  type: 'image' | 'video' | 'texte' | 'conv_clip';
  thumbnail_url: string | null;
  title: string | null;
  preview_text: string | null;
  published_at: number;
  like_count: number;
  view_count: number;
  /** Talk2Me #383 — position custom (drag & drop). NULL = ordre par défaut. */
  order_position: number | null;
}

export interface PostStatsRow {
  post_id: string;
  likes: number;
  views: number;
  share_count: number;
  save_count: number;
  comment_count: number;
}

type TopMetric = 'likes' | 'views' | 'shares' | 'saves';
type TopWindow = 'day' | 'week' | 'month' | 'all';

// ===================== Author batch fetch =====================

/**
 * Talk2Me #378 — Récupère en 1 SELECT IN (...) les infos d'auteur publiques
 * pour une liste d'user_ids. Retourne une Map<userId, PostAuthor>. Si un
 * user n'existe plus (id orphelin), il sera absent de la Map → l'appelant
 * doit gérer `author: null` côté front (fallback "Anonyme").
 */
export function getPostAuthorsByIds(userIds: string[]): Map<string, PostAuthor> {
  const map = new Map<string, PostAuthor>();
  if (!userIds || userIds.length === 0) return map;
  const unique = [...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return map;
  const db = getDb();
  const placeholders = unique.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, display_name, username, avatar_url FROM users WHERE id IN (${placeholders})`
    )
    .all(...unique) as any[];
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      display_name: typeof r.display_name === 'string' && r.display_name.trim() !== ''
        ? r.display_name
        : null,
      username: r.username,
      avatar_url: typeof r.avatar_url === 'string' && r.avatar_url.length > 0
        ? r.avatar_url
        : null,
    });
  }
  return map;
}

// ===================== createPost =====================

export function createPost(
  userId: string,
  conversationId: string,
  messageIds: string[]
): DbPostWithMessagesAndAuthor {
  if (!userId) throw new Error('userId required');
  if (!messageIds.length) {
    throw new Error('messageIds cannot be empty');
  }

  const db = getDb();

  // Use transaction for atomicity
  const createPostTransaction = db.transaction(() => {
    // Verify all message IDs exist and belong to conversationId
    const placeholders = messageIds.map(() => '?').join(',');
    const messages = db.prepare(
      `SELECT * FROM messages WHERE id IN (${placeholders}) AND conversation_id = ?`
    ).all(...messageIds, conversationId) as any[];

    if (messages.length !== messageIds.length) {
      throw new Error('One or more message IDs are invalid or do not belong to this conversation');
    }

    // Create the post
    const id = randomUUID();
    const now = Date.now();
    const messageIdsJson = JSON.stringify(messageIds);

    db.prepare(
      'INSERT INTO posts (id, user_id, conversation_id, message_ids, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, conversationId, messageIdsJson, now);

    // Return the post with messages
    const postRow = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;

    // Reorder messages to match the requested messageIds order
    const messageMap = new Map<string, any>();
    for (const m of messages) messageMap.set(m.id, m);
    const orderedMessages = messageIds
      .map((mid) => messageMap.get(mid))
      .filter((m) => m !== undefined)
      .map(parseMessageRow);

    return {
      id: postRow.id,
      user_id: postRow.user_id,
      conversation_id: postRow.conversation_id,
      message_ids: parseJsonArray(postRow.message_ids),
      created_at: postRow.created_at,
      likes: postRow.likes,
      views: postRow.views,
      messages: orderedMessages,
    };
  });

  const created = createPostTransaction();
  // Talk2Me #378 — enrichi avec l'auteur pour PostResponse côté API.
  const authorsMap = getPostAuthorsByIds([created.user_id]);
  return {
    ...created,
    author: authorsMap.get(created.user_id) ?? null,
  };
}

// ===================== Feed reads =====================

export function getPosts(limit?: number): DbPostWithMessagesAndAuthor[] {
  const db = getDb();

  // Lot A : exclut soft-deleted ET archivés du feed public.
  const postsQuery = limit
    ? db.prepare(
        'SELECT * FROM posts WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ?'
      )
    : db.prepare(
        'SELECT * FROM posts WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC'
      );

  const posts = (limit ? postsQuery.all(limit) : postsQuery.all()) as any[];

  if (!posts.length) return [];

  // Collect all message IDs from all posts
  const allMessageIds: string[] = [];
  const postMessageIdsMap: Map<string, string[]> = new Map();

  for (const post of posts) {
    const ids = parseJsonArray(post.message_ids);
    postMessageIdsMap.set(post.id, ids);
    allMessageIds.push(...ids);
  }

  // Fetch all messages in one query using IN clause
  const uniqueMessageIds = [...new Set(allMessageIds)];
  const placeholders = uniqueMessageIds.map(() => '?').join(',');
  const messages = db.prepare(
    `SELECT * FROM messages WHERE id IN (${placeholders})`
  ).all(...uniqueMessageIds) as any[];

  // Build message lookup
  const messageMap = new Map<string, DbMessage>();
  for (const msg of messages) {
    messageMap.set(msg.id, parseMessageRow(msg));
  }

  // Talk2Me #378 — batch-fetch des auteurs en 1 SELECT IN (...).
  const authorsMap = getPostAuthorsByIds(posts.map((p) => p.user_id));

  // Reconstruct posts with messages in correct order
  return posts.map((post) => {
    const messageIds = postMessageIdsMap.get(post.id) || [];
    const orderedMessages = messageIds
      .map((id) => messageMap.get(id))
      .filter((msg): msg is DbMessage => msg !== undefined);

    return {
      id: post.id,
      user_id: post.user_id,
      conversation_id: post.conversation_id,
      message_ids: messageIds,
      created_at: post.created_at,
      likes: post.likes,
      views: post.views,
      messages: orderedMessages,
      author: authorsMap.get(post.user_id) ?? null,
    };
  });
}

/**
 * Retourne un flux unifié posts + direct_cards trié par created_at DESC.
 * Items typés via discriminant `kind`.
 *
 * Talk2Me #378 — chaque item porte un `author` (PostAuthor | null) batch-fetché
 * via getPostAuthorsByIds. 1 seul SELECT IN (...) global (posts.user_id ∪
 * direct_cards.user_id) → pas de N+1.
 */
export function getMixedFeed(limit = 20, offset = 0): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  // On charge un peu plus de chaque côté, on merge, on tranche
  const pool = limit + offset;
  const posts = getPosts(pool); // déjà enrichis avec author
  const cards = getDirectCards(pool, 0);

  // Talk2Me #378 — batch author pour les direct_cards (les posts ont déjà
  // été enrichis par getPosts, on les laisse).
  const cardAuthorsMap = getPostAuthorsByIds(cards.map((c) => c.user_id));
  const cardsWithAuthor: DbDirectCardWithAuthor[] = cards.map((c) => ({
    ...c,
    author: cardAuthorsMap.get(c.user_id) ?? null,
  }));

  const merged: Array<
    | { kind: 'post'; data: DbPostWithMessagesAndAuthor; ts: number }
    | { kind: 'direct'; data: DbDirectCardWithAuthor; ts: number }
  > = [];
  for (const p of posts) merged.push({ kind: 'post', data: p, ts: p.created_at });
  for (const c of cardsWithAuthor) merged.push({ kind: 'direct', data: c, ts: c.created_at });
  merged.sort((a, b) => b.ts - a.ts);
  return merged.slice(offset, offset + limit).map((m) =>
    m.kind === 'post'
      ? { kind: 'post' as const, data: m.data }
      : { kind: 'direct' as const, data: m.data }
  );
}

/**
 * Talk2Me #383 (Pascal 2026-06-05) — Flux user-scoped pour le viewer
 * /mes-cards/[id] : SEULEMENT les cards du userId fourni (pas le feed mixte).
 *
 * Pascal verbatim : « si je clic sur lapersu je doit voir la card selevtionner
 * et non pas atterir sur le hub […] cards previcedente par odre de liste de
 * la page card ». L'utilisateur scroll uniquement parmi SES cards.
 *
 * Tri : order_position non-NULL ASC d'abord, puis created_at DESC. Cohérent
 * avec getUserPublishedCards et l'UI /drafts.
 */
export function getUserCardsForViewer(
  userId: string,
  limit = 100,
  offset = 0
): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));

  // 1) Posts de cet utilisateur, déjà enrichis avec messages + author.
  const postRows = db
    .prepare(
      `SELECT * FROM posts
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY (order_position IS NULL) ASC, order_position ASC, created_at DESC`
    )
    .all(userId) as any[];

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
  const authorsMap = getPostAuthorsByIds([userId]);
  const author = authorsMap.get(userId) ?? null;

  const posts: Array<{
    data: DbPostWithMessagesAndAuthor;
    order_position: number | null;
    created_at: number;
  }> = postRows.map((p) => {
    const ids = postMessageIdsMap.get(p.id) || [];
    const orderedMessages = ids
      .map((id) => messageMap.get(id))
      .filter((m): m is DbMessage => m !== undefined);
    return {
      data: {
        id: p.id,
        user_id: p.user_id,
        conversation_id: p.conversation_id,
        message_ids: ids,
        created_at: p.created_at,
        likes: p.likes,
        views: p.views,
        messages: orderedMessages,
        author,
      },
      order_position:
        typeof p.order_position === 'number' ? p.order_position : null,
      created_at: p.created_at,
    };
  });

  // 2) Direct cards de cet utilisateur.
  const dcRows = db
    .prepare(
      `SELECT * FROM direct_cards
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY (order_position IS NULL) ASC, order_position ASC, created_at DESC`
    )
    .all(userId) as any[];

  const cards: Array<{
    data: DbDirectCardWithAuthor;
    order_position: number | null;
    created_at: number;
  }> = dcRows.map((r) => {
    const parsed = parseDirectCardRow(r);
    return {
      data: { ...parsed, author },
      order_position:
        typeof r.order_position === 'number' ? r.order_position : null,
      created_at: r.created_at,
    };
  });

  // Merge + tri unifié order_position d'abord puis created_at DESC
  const merged: Array<{
    kind: 'post' | 'direct';
    data: DbPostWithMessagesAndAuthor | DbDirectCardWithAuthor;
    order_position: number | null;
    created_at: number;
  }> = [
    ...posts.map((p) => ({ kind: 'post' as const, ...p })),
    ...cards.map((c) => ({ kind: 'direct' as const, ...c })),
  ];
  merged.sort((a, b) => {
    const aHas = a.order_position !== null;
    const bHas = b.order_position !== null;
    if (aHas && bHas) return (a.order_position as number) - (b.order_position as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return b.created_at - a.created_at;
  });

  return merged.slice(off, off + n).map((m) =>
    m.kind === 'post'
      ? { kind: 'post' as const, data: m.data as DbPostWithMessagesAndAuthor }
      : { kind: 'direct' as const, data: m.data as DbDirectCardWithAuthor }
  );
}

// ===================== getUserPublishedCards =====================

/** Extrait un texte d'aperçu (premier message non vide) d'un post conv_clip. */
export function extractPostPreview(post: DbPostWithMessages): {
  preview_text: string | null;
  thumbnail_url: string | null;
} {
  let preview: string | null = null;
  let thumb: string | null = null;
  for (const m of post.messages) {
    if (!preview && m.text && m.text.trim().length > 0) {
      preview = m.text.trim().slice(0, 200);
    }
    if (!thumb) {
      // 1er thumbnail trouvé : youtube > place photo > recipe image
      const yt = m.youtube as { video_id?: string; thumbnail_url?: string } | null | undefined;
      if (yt && typeof yt.video_id === 'string' && yt.video_id) {
        thumb = `https://i.ytimg.com/vi/${yt.video_id}/hqdefault.jpg`;
      }
      const places = m.places as Array<{ photo_url?: string }> | null | undefined;
      if (!thumb && Array.isArray(places) && places[0]?.photo_url) {
        thumb = places[0].photo_url;
      }
      const recipe = m.recipe as { image_url?: string } | null | undefined;
      if (!thumb && recipe && typeof recipe.image_url === 'string' && recipe.image_url) {
        thumb = recipe.image_url;
      }
    }
    if (preview && thumb) break;
  }
  return { preview_text: preview, thumbnail_url: thumb };
}

export function getUserPublishedCards(
  userId: string,
  limit = 50,
  offset = 0
): PublishedCardItem[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));

  // 1) Direct cards de cet utilisateur — exclut soft-deleted ET archivées
  //    (l'archive est visible UNIQUEMENT dans l'onglet "Archive" dédié).
  // Talk2Me #383 — tri : order_position non-NULL en premier (ASC), puis
  // chronologique DESC. Permet le drag & drop reorder sans casser le défaut.
  const dcRows = db
    .prepare(
      `SELECT * FROM direct_cards
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY (order_position IS NULL) ASC, order_position ASC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, n + off, 0) as any[];

  const directItems: PublishedCardItem[] = dcRows.map((r) => {
    const card = parseDirectCardRow(r);
    const type: PublishedCardItem['type'] = card.type;
    const previewText =
      card.caption && card.caption.trim().length > 0
        ? card.caption.trim().slice(0, 200)
        : card.text && card.text.trim().length > 0
          ? card.text.trim().slice(0, 200)
          : null;
    return {
      id: card.id,
      card_kind: 'direct_card',
      type,
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
      order_position:
        typeof r.order_position === 'number' ? r.order_position : null,
    };
  });

  // 2) Posts (clips de conversation) de cet utilisateur — idem filter
  // Talk2Me #383 — même tri que direct_cards (order_position puis date).
  const postRows = db
    .prepare(
      `SELECT * FROM posts
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY (order_position IS NULL) ASC, order_position ASC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, n + off, 0) as any[];

  // Charge tous les messages référencés en un seul SELECT
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

  const postItems: PublishedCardItem[] = postRows.map((p) => {
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
      id: p.id,
      card_kind: 'post',
      type: 'conv_clip',
      thumbnail_url,
      title: preview_text ? preview_text.slice(0, 80) : null,
      preview_text,
      published_at: p.created_at,
      like_count: p.likes ?? 0,
      view_count: p.views ?? 0,
      order_position:
        typeof p.order_position === 'number' ? p.order_position : null,
    };
  });

  // Talk2Me #383 — Merge + tri unifié order_position non-NULL d'abord (ASC),
  // puis published_at DESC pour le reste.
  const merged = [...directItems, ...postItems].sort((a, b) => {
    const ap = a.order_position;
    const bp = b.order_position;
    const aHas = ap !== null && ap !== undefined;
    const bHas = bp !== null && bp !== undefined;
    if (aHas && bHas) return (ap as number) - (bp as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return b.published_at - a.published_at;
  });
  return merged.slice(off, off + n);
}

// ===================== loadPostsByIds helper (private to posts/T2M Officiel) =====================

/** Charge posts par IDs en préservant l'ordre passé en entrée. */
export function loadPostsByIds(ids: string[]): DbPostWithMessagesAndAuthor[] {
  if (!ids || ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE id IN (${placeholders}) AND deleted_at IS NULL AND archived_at IS NULL`,
    )
    .all(...ids) as any[];
  if (!rows.length) return [];

  // Collect message IDs
  const allMessageIds: string[] = [];
  const postMessageIdsMap: Map<string, string[]> = new Map();
  for (const post of rows) {
    const mids = parseJsonArray(post.message_ids);
    postMessageIdsMap.set(post.id, mids);
    allMessageIds.push(...mids);
  }
  const uniqueMessageIds = [...new Set(allMessageIds)];
  const messageMap = new Map<string, DbMessage>();
  if (uniqueMessageIds.length > 0) {
    const ph = uniqueMessageIds.map(() => '?').join(',');
    const msgs = db
      .prepare(`SELECT * FROM messages WHERE id IN (${ph})`)
      .all(...uniqueMessageIds) as any[];
    for (const m of msgs) messageMap.set(m.id, parseMessageRow(m));
  }
  const authorsMap = getPostAuthorsByIds(rows.map((p) => p.user_id));

  // Préserve l'ordre passé en entrée
  const byId = new Map<string, any>();
  for (const r of rows) byId.set(r.id, r);
  const out: DbPostWithMessagesAndAuthor[] = [];
  for (const id of ids) {
    const post = byId.get(id);
    if (!post) continue;
    const mids = postMessageIdsMap.get(post.id) || [];
    const orderedMessages = mids
      .map((mid) => messageMap.get(mid))
      .filter((m): m is DbMessage => m !== undefined);
    out.push({
      id: post.id,
      user_id: post.user_id,
      conversation_id: post.conversation_id,
      message_ids: mids,
      created_at: post.created_at,
      likes: post.likes || 0,
      views: post.views || 0,
      messages: orderedMessages,
      author: authorsMap.get(post.user_id) ?? null,
    });
  }
  return out;
}

// ===================== T2M Officiel helpers (search + top + buzz + stats) =====================

/**
 * Cherche dans les posts publics par mots-clés (LIKE sur messages.text +
 * messages.intent_query). Retourne posts non-deleted, non-archivés.
 */
export function searchDbPosts(
  query: string,
  limit: number = 5,
): DbPostWithMessagesAndAuthor[] {
  const q = (query || '').trim();
  if (!q) return [];
  const lim = Math.max(1, Math.min(limit, 20));
  const db = getDb();
  const like = `%${q.toLowerCase()}%`;
  // Cherche les message ids qui matchent puis remonte aux posts qui les
  // contiennent. message_ids est stocké comme TEXT JSON → LIKE sur la string
  // suffit pour matcher un id.
  const msgRows = db
    .prepare(
      `SELECT id FROM messages
         WHERE (LOWER(COALESCE(text, '')) LIKE ?
             OR LOWER(COALESCE(intent_query, '')) LIKE ?)
         ORDER BY created_at DESC
         LIMIT 200`,
    )
    .all(like, like) as Array<{ id: string }>;
  if (!msgRows.length) return [];

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const m of msgRows) {
    const idLike = `%${m.id}%`;
    const post = db
      .prepare(
        `SELECT id FROM posts
           WHERE message_ids LIKE ?
             AND deleted_at IS NULL
             AND archived_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1`,
      )
      .get(idLike) as { id?: string } | undefined;
    if (post && post.id && !seen.has(post.id)) {
      seen.add(post.id);
      orderedIds.push(post.id);
      if (orderedIds.length >= lim) break;
    }
  }
  return loadPostsByIds(orderedIds);
}

/**
 * Top posts par métrique sur une fenêtre temporelle.
 * - metric : likes | views | shares | saves
 * - window : day (24h) | week (7j) | month (30j) | all
 */
export function getTopPostsByMetric(
  metric: TopMetric,
  window: TopWindow,
  limit: number = 5,
): DbPostWithMessagesAndAuthor[] {
  const lim = Math.max(1, Math.min(limit, 20));
  const col = (() => {
    switch (metric) {
      case 'likes':
        return 'likes';
      case 'views':
        return 'views';
      case 'shares':
        return 'share_count';
      case 'saves':
        return 'save_count';
      default:
        return 'likes';
    }
  })();
  const now = Date.now();
  const threshold = (() => {
    switch (window) {
      case 'day':
        return now - 24 * 60 * 60 * 1000;
      case 'week':
        return now - 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return now - 30 * 24 * 60 * 60 * 1000;
      case 'all':
      default:
        return 0;
    }
  })();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM posts
         WHERE deleted_at IS NULL
           AND archived_at IS NULL
           AND created_at >= ?
         ORDER BY COALESCE(${col}, 0) DESC, created_at DESC
         LIMIT ?`,
    )
    .all(threshold, lim) as Array<{ id: string }>;
  return loadPostsByIds(rows.map((r) => r.id));
}

/**
 * Score buzz = likes*2 + views*0.1 + shares*5 + saves*3 avec décroissance
 * temporelle (demi-vie 7 jours). Top N posts.
 */
export function getBuzzCards(
  limit: number = 5,
): DbPostWithMessagesAndAuthor[] {
  const lim = Math.max(1, Math.min(limit, 20));
  const db = getDb();
  // On limite à 200 derniers candidats sur 30j, on score en JS pour le decay.
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT id, likes, views, share_count, save_count, created_at
         FROM posts
         WHERE deleted_at IS NULL
           AND archived_at IS NULL
           AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 200`,
    )
    .all(threshold) as Array<{
    id: string;
    likes: number | null;
    views: number | null;
    share_count: number | null;
    save_count: number | null;
    created_at: number;
  }>;
  if (!rows.length) {
    // Fallback all-time si rien sur 30j
    const allRows = db
      .prepare(
        `SELECT id, likes, views, share_count, save_count, created_at
           FROM posts
           WHERE deleted_at IS NULL AND archived_at IS NULL
           ORDER BY (COALESCE(likes,0)*2 + COALESCE(views,0)*0.1 + COALESCE(share_count,0)*5 + COALESCE(save_count,0)*3) DESC
           LIMIT ?`,
      )
      .all(lim) as Array<{ id: string }>;
    return loadPostsByIds(allRows.map((r) => r.id));
  }
  const now = Date.now();
  const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
  const scored = rows
    .map((r) => {
      const ageMs = Math.max(0, now - r.created_at);
      const decay = Math.pow(0.5, ageMs / HALF_LIFE_MS);
      const raw =
        (r.likes || 0) * 2 +
        (r.views || 0) * 0.1 +
        (r.share_count || 0) * 5 +
        (r.save_count || 0) * 3;
      return { id: r.id, score: raw * decay };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, lim);
  return loadPostsByIds(scored.map((s) => s.id));
}

/** Récupère les métriques agrégées d'un post. */
export function getPostStats(post_id: string): PostStatsRow | null {
  if (!post_id) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id AS post_id, likes, views, share_count, save_count, comment_count
         FROM posts
         WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(post_id) as PostStatsRow | undefined;
  if (!row) return null;
  return {
    post_id: row.post_id,
    likes: row.likes || 0,
    views: row.views || 0,
    share_count: row.share_count || 0,
    save_count: row.save_count || 0,
    comment_count: row.comment_count || 0,
  };
}

// Re-export DirectCardType pour compat (utilisé par FeedItem défini ici).
export type { DirectCardType };
