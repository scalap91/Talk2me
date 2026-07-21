/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-posts — domaine « posts & feed » (posts/clips, feed unifie, index de
 * recherche FTS5, T2M Officiel) + commerce residuel entrelace (wallet/boost,
 * boutiques, SMS Talk/comm, drive/rides) extrait de lib/db.ts (decoupage
 * #53/db-core, Pascal 2026-06-30). NOTE: gros module, sous-divisible plus tard
 * (Feed / Shop / Drive / Comm). Primitives via @/lib/db-core ; cards/users/messages
 * via facade @/lib/db (lazy). Re-exporte par db.ts -> appelants inchanges.
 */
import { randomUUID } from 'crypto';
import path from 'path';
import { getShopDb } from '@/lib/shop-db';
import {
  extractCardMetadata, metadataMapFromText, searchableFromMap, extractHashtagsFromText,
} from '@/lib/search/metadata-map';
import type { CardMetadataMap } from '@/lib/search/metadata-map';
import { deriveSearchText } from '@/lib/cards/v2/reader/search';
import { getDb, parseJsonArray } from '@/lib/db-core';
import type { DbUser } from '@/lib/db-core';
import {
  createDirectCard, getDirectCards, getUserById, mirrorPostToUnified,
  parseDirectCardRow, parseMessageRow,
} from '@/lib/db';
import type { DbDirectCard, DbMessage, DirectCardType } from '@/lib/db';

// ============ posts ============
// /lib/db/posts.ts — Table posts (clips de conversation publiés) + auteurs +
// feed mixte posts/direct_cards + recherche + top metrics + buzz.


// ===================== Types =====================

export interface DbPost {
  id: string;
  user_id: string;
  conversation_id: string;
  message_ids: string[];
  created_at: number;
  likes: number;
  views: number;
  /** Talk2Me #427 — boost payant (ms jusqu'auquel le post est mis en avant). */
  boosted_until?: number | null;
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
  type: 'image' | 'video' | 'texte' | 'conv_clip' | 'boutique' | 'formation';
  thumbnail_url: string | null;
  title: string | null;
  preview_text: string | null;
  published_at: number;
  like_count: number;
  view_count: number;
  /** Talk2Me #383 — position custom (drag & drop). NULL = ordre par défaut. */
  order_position: number | null;
  /** Talk2Me #427 — a un produit attaché (→ onglet Shop de "Mes cards"). */
  has_product?: boolean;
  /** Talk2Me #427 — produit attaché (rendu sur la ligne Shop) + son éventuel.
      #428 — sizes (tailles) + wholesale (gros) : champs vendeur (cas Law). */
  product?: { title?: string; image_url?: string | null; price_label?: string | null; sizes?: string | null; wholesale?: boolean; source?: string; cj_pid?: string | null } | null;
  has_audio?: boolean;
  /** Talk2Me #427 — boost actif jusqu'à (ms). */
  boosted_until?: number | null;
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

// ===================== Card metadata indexing (Talk2Me #402) =====================
// Construit une CardMetadataMap à partir des messages d'un post, SANS
// appel HTTP (best-effort sur les colonnes JSON déjà résolues côté
// agent : `youtube`, `tiktok`, `weather`, `wikipedia`, etc.). Pour les
// posts purement textuels → metadataMapFromText. Pour les autres URLs
// connues mais non-résolues côté agent (ex: Spotify partagée par un user
// sans extracteur), le backfill async via /api/embed-hub peut compléter.
// Garde-fou : ne JAMAIS faire planter createPost si l'extraction échoue.

function buildCardMetadataMapFromMessages(
  messages: DbMessage[],
): CardMetadataMap {
  if (!messages || messages.length === 0) {
    return metadataMapFromText('');
  }

  // (1) Si un message contient un `youtube` résolu (colonne JSON), prio
  // absolue — c'est le cas Pascal "Young Thug" : la metadata est déjà
  // là, on n'a juste pas le bon mapping pour la rendre searchable.
  for (const m of messages) {
    const y = m.youtube;
    if (y && typeof y === 'object') {
      const video_id = (y as any).video_id || '';
      const title = (y as any).title || '';
      const channel = (y as any).channel || '';
      const description = (y as any).description || '';
      const thumbnail = (y as any).thumbnail;
      const allText = `${title} ${description} ${channel} ${m.text || ''}`;
      return {
        type: 'youtube',
        title,
        channel,
        description: description || undefined,
        tags: [],
        hashtags: extractHashtagsFromText(allText),
        video_id,
        thumbnail_url: thumbnail || undefined,
      };
    }
  }

  // (2) Si un message contient un `tiktok` résolu (colonne JSON)
  for (const m of messages) {
    const t = m.tiktok;
    if (t && typeof t === 'object') {
      const title = (t as any).title || (t as any).description || '';
      const description = (t as any).description || '';
      const author_handle = (t as any).author_handle || (t as any).user || '';
      const video_id = (t as any).video_id || '';
      const allText = `${title} ${description} ${author_handle} ${m.text || ''}`;
      return {
        type: 'tiktok',
        title,
        author_handle,
        description: description || undefined,
        hashtags: extractHashtagsFromText(allText),
        video_id: video_id || undefined,
      };
    }
  }

  // (3) Concat de tout le texte des messages comme fallback. Indexe le
  // texte brut (recipes/wikipedia/etc. apportent leur sémantique via
  // intent_query mais on garde simple au MVP).
  const joinedText = messages
    .map((m) => m.text || '')
    .filter((t) => t.trim().length > 0)
    .join(' ')
    .trim();
  return metadataMapFromText(joinedText);
}

/**
 * Indexe une card (post OU direct_card) dans card_search + persiste son
 * metadata_map JSON sur la table source. Best-effort : try/catch global,
 * on n'échoue JAMAIS la création.
 */
export function indexCardSafely(
  kind: CardSearchKind,
  cardId: string,
  map: CardMetadataMap,
  // Chantier A — recherche v2 : le `.card` BRUT (objet parsé), source de vérité.
  // Optionnel + flaggé : quand fourni ET SUPERCARD_SEARCH_V2=1, on AUGMENTE le
  // blob FTS avec la projection `search` du lecteur unique (deriveSearchText).
  // Absent / flag off ⇒ comportement identique à avant (zéro régression).
  rawCard?: unknown,
): void {
  try {
    const json = JSON.stringify(map);
    if (kind === 'post') setPostMetadataMap(cardId, json);
    else setDirectCardMetadataMap(cardId, json);
    const fields = searchableFromMap(map);
    if (rawCard !== undefined && process.env.SUPERCARD_SEARCH_V2 === '1') {
      const extra = deriveSearchText(rawCard);
      if (extra) fields.body = `${fields.body || ''} ${extra}`.trim();
    }
    upsertCardSearchIndex(kind, cardId, fields);
  } catch (e) {
    console.warn('[db.indexCardSafely] failed', kind, cardId, e);
  }
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

    // P2 — double écriture dans la matrice unifiée (best-effort).
    mirrorPostToUnified(postRow as Record<string, unknown>);

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

  // Talk2Me #402 — Indexation référencement (Pascal 2026-06-05). Best-effort,
  // ne JAMAIS faire planter la création du post. Doctrine [[modular-no-scattered-patches]] :
  // toute la logique d'extraction vit dans lib/search/metadata-map.ts.
  try {
    const map = buildCardMetadataMapFromMessages(created.messages);
    indexCardSafely('post', created.id, map);
  } catch (e) {
    console.warn('[createPost] indexing skipped', created.id, e);
  }

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
      boosted_until: typeof post.boosted_until === 'number' ? post.boosted_until : null,
      messages: orderedMessages,
      author: authorsMap.get(post.user_id) ?? null,
    };
  });
}

// ===== Shop & Commerce -> EXTRAIT dans lib/db-commerce.ts (sous-decoupage #53, Pascal 2026-06-30) =====
// ===== Drive & Comm    -> EXTRAIT dans lib/db-drive.ts    (sous-decoupage #53, Pascal 2026-06-30) =====
// (re-exportes par db.ts ; ce module = Feed/posts/feed-reads/FTS5/T2M Officiel)
/**
 * Cards commerce (produit attaché) pour que Léa propose des offres de la
 * communauté/artisans. Les BOOSTÉES actives (boosted_until > now) sont
 * remontées EN PREMIER (Pascal : "Léa doit favoriser les offres boostées").
 */
export function getShopCards(now: number, limit = 8): DbDirectCardWithAuthor[] {
  const cards = getDirectCards(300, 0).filter((c) => !!c.attached_product_json);
  const authorsMap = getPostAuthorsByIds(cards.map((c) => c.user_id));
  const boostScore = (c: DbDirectCard) =>
    typeof c.boosted_until === 'number' && (c.boosted_until as number) > now
      ? (c.boosted_until as number)
      : 0;
  return cards
    .sort((a, b) => {
      const ba = boostScore(a);
      const bb = boostScore(b);
      if ((bb > 0 ? 1 : 0) !== (ba > 0 ? 1 : 0)) return (bb > 0 ? 1 : 0) - (ba > 0 ? 1 : 0);
      if (bb !== ba) return bb - ba; // parmi les boostées, la plus longue d'abord
      return b.created_at - a.created_at; // sinon les plus récentes
    })
    .slice(0, limit)
    .map((c) => ({ ...c, author: authorsMap.get(c.user_id) ?? null }));
}

/**
 * Retourne un flux unifié posts + direct_cards trié par created_at DESC.
 * Items typés via discriminant `kind`.
 *
 * Talk2Me #378 — chaque item porte un `author` (PostAuthor | null) batch-fetché
 * via getPostAuthorsByIds. 1 seul SELECT IN (...) global (posts.user_id ∪
 * direct_cards.user_id) → pas de N+1.
 */
/**
 * Talk2Me (#audit perf) — Page EXACTE du flux "Tout" (tri récent, sans filtre
 * auteur ni commerce) via pagination keyset SQL.
 *
 * Avant : getMixedFeed chargeait `limit+offset` lignes de CHAQUE table à chaque
 * loadMore, merge + tri en JS, puis slice → coût qui croît avec la profondeur de
 * scroll (chaque page re-fetch tout le préfixe). Ici on calcule d'abord les clés
 * de la page exacte via un UNION ALL ordonné (boostés d'abord, puis date DESC),
 * LIMIT/OFFSET au niveau SQL, et on n'hydrate QUE ces ~20 lignes (messages +
 * auteurs). Sémantique identique : mêmes filtres (deleted/archived/boutique_id)
 * et même ordre (boost DESC, created_at DESC) que l'ancien chemin par défaut.
 */
function getMixedFeedRecentPage(
  limit: number,
  offset: number
): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  const db = getDb();
  const now = Date.now();

  // 1) Clés de la page exacte (boostés d'abord, puis récents).
  const keys = db
    .prepare(
      `SELECT id, kind, created_at FROM (
         SELECT id, 'post' AS kind, created_at, boosted_until
           FROM posts
          WHERE deleted_at IS NULL AND archived_at IS NULL
         UNION ALL
         SELECT id, 'direct' AS kind, created_at, boosted_until
           FROM direct_cards
          WHERE deleted_at IS NULL AND archived_at IS NULL AND boutique_id IS NULL
            AND (category IS NULL OR category != 'plat_maison')
       )
       ORDER BY (CASE WHEN boosted_until IS NOT NULL AND boosted_until > ? THEN 1 ELSE 0 END) DESC,
                created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(now, limit, offset) as Array<{ id: string; kind: 'post' | 'direct'; created_at: number }>;

  if (keys.length === 0) return [];

  return hydrateFeedKeys(keys);
}

/** Hydrate une page de clés [{id, kind}] (posts → messages+auteur ; direct → auteur).
 *  Partagé par le chemin classique ET le chemin unified_posts (LOT 2 ④) — zéro duplication. */
function hydrateFeedKeys(
  keys: Array<{ id: string; kind: 'post' | 'direct'; created_at: number }>
): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  const db = getDb();
  if (keys.length === 0) return [];
  const postIds = keys.filter((k) => k.kind === 'post').map((k) => k.id);
  const directIds = keys.filter((k) => k.kind === 'direct').map((k) => k.id);

  // 2a) Hydrate les posts de la page (messages + auteur).
  const postMap = new Map<string, DbPostWithMessagesAndAuthor>();
  if (postIds.length) {
    const ph = postIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM posts WHERE id IN (${ph})`).all(...postIds) as any[];
    const allMsgIds: string[] = [];
    const msgIdsByPost = new Map<string, string[]>();
    for (const p of rows) {
      const ids = parseJsonArray(p.message_ids);
      msgIdsByPost.set(p.id, ids);
      allMsgIds.push(...ids);
    }
    const messageMap = new Map<string, DbMessage>();
    const uniq = [...new Set(allMsgIds)];
    if (uniq.length) {
      const mph = uniq.map(() => '?').join(',');
      const msgs = db.prepare(`SELECT * FROM messages WHERE id IN (${mph})`).all(...uniq) as any[];
      for (const m of msgs) messageMap.set(m.id, parseMessageRow(m));
    }
    const authorsMap = getPostAuthorsByIds(rows.map((p) => p.user_id));
    for (const p of rows) {
      const mids = msgIdsByPost.get(p.id) || [];
      const ordered = mids
        .map((id) => messageMap.get(id))
        .filter((m): m is DbMessage => m !== undefined);
      postMap.set(p.id, {
        id: p.id,
        user_id: p.user_id,
        conversation_id: p.conversation_id,
        message_ids: mids,
        created_at: p.created_at,
        likes: p.likes,
        views: p.views,
        boosted_until: typeof p.boosted_until === 'number' ? p.boosted_until : null,
        messages: ordered,
        author: authorsMap.get(p.user_id) ?? null,
      });
    }
  }

  // 2b) Hydrate les direct_cards de la page (+ auteur).
  const directMap = new Map<string, DbDirectCardWithAuthor>();
  if (directIds.length) {
    const ph = directIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM direct_cards WHERE id IN (${ph})`).all(...directIds) as any[];
    const cards = rows.map(parseDirectCardRow);
    const authorMap = getPostAuthorsByIds(cards.map((c) => c.user_id));
    for (const c of cards) directMap.set(c.id, { ...c, author: authorMap.get(c.user_id) ?? null });
  }

  // 3) Ré-assemble dans l'ordre EXACT des clés SQL.
  const out: Array<
    | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
    | { kind: 'direct'; data: DbDirectCardWithAuthor }
  > = [];
  for (const k of keys) {
    if (k.kind === 'post') {
      const d = postMap.get(k.id);
      if (d) out.push({ kind: 'post', data: d });
    } else {
      const d = directMap.get(k.id);
      if (d) out.push({ kind: 'direct', data: d });
    }
  }
  return out;
}

/** LOT 2 ④ — page récente du feed lue depuis l'INDEX UNIFIÉ `unified_posts` (table unique),
 *  puis hydratée par le helper partagé. Derrière flag `unified_feed` (OFF par défaut). */
export function getUnifiedFeedRecentPage(limit = 20, offset = 0): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  const db = getDb();
  const now = Date.now();
  const keys = db.prepare(
    `SELECT id, CASE WHEN source='post' THEN 'post' ELSE 'direct' END AS kind, created_at
       FROM unified_posts
      WHERE deleted_at IS NULL AND archived_at IS NULL
        AND NOT (source='direct_card' AND (boutique_id IS NOT NULL OR category='plat_maison'))
      ORDER BY (CASE WHEN boosted_until IS NOT NULL AND boosted_until > ? THEN 1 ELSE 0 END) DESC,
               created_at DESC
      LIMIT ? OFFSET ?`
  ).all(now, limit, offset) as Array<{ id: string; kind: 'post' | 'direct'; created_at: number }>;
  return hydrateFeedKeys(keys);
}

/**
 * Talk2Me — Classement du feed « Tout » façon TikTok (Pascal 2026-06-25).
 *
 * Plus de tri par date pure (qui plaçait T2M Officiel toujours en tête car il
 * poste souvent). À la place un SCORE = engagement / fraîcheur :
 *
 *   engagement = likes×3 + commentaires×4 + partages×5 + vues×0.5
 *   score      = (1 + engagement) / (âge_en_heures + 2)^1.5
 *
 * - Un post NEUF démarre haut (faible âge) → il est "testé", montré à des users.
 * - S'il récolte likes/commentaires/partages, son score monte et il RESTE visible.
 * - Sinon il décroît avec le temps et redescend — quel que soit l'auteur.
 * - AUCUN privilège pour T2M Officiel : il est classé comme tout le monde.
 * - Les posts BOOSTÉS payants (#427) restent prioritaires (c'est ce que l'user paie).
 *
 * On score un pool des items récents (borné) puis on tranche la page demandée.
 */
export function getMixedFeedRankedPage(limit = 20, offset = 0): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  const db = getDb();
  const now = Date.now();
  const POOL = 800; // on classe les 800 items les plus récents de chaque source

  const postRows = db.prepare(
    `SELECT id, user_id, created_at, COALESCE(likes,0) AS likes, COALESCE(views,0) AS views,
            COALESCE(comment_count,0) AS cc, COALESCE(boosted_until,0) AS boost
       FROM posts
      WHERE deleted_at IS NULL AND archived_at IS NULL
      ORDER BY created_at DESC LIMIT ?`
  ).all(POOL) as Array<{ id: string; user_id: string; created_at: number; likes: number; views: number; cc: number; boost: number }>;

  const cardRows = db.prepare(
    `SELECT id, user_id, created_at, COALESCE(likes,0) AS likes, COALESCE(views,0) AS views,
            COALESCE(share_count,0) AS sc, COALESCE(comment_count,0) AS cc, COALESCE(boosted_until,0) AS boost
       FROM direct_cards
      WHERE deleted_at IS NULL AND archived_at IS NULL AND boutique_id IS NULL
        AND (category IS NULL OR category != 'plat_maison')
      ORDER BY created_at DESC LIMIT ?`
  ).all(POOL) as Array<{ id: string; user_id: string; created_at: number; likes: number; views: number; sc: number; cc: number; boost: number }>;

  const score = (likes: number, comments: number, shares: number, views: number, createdAt: number): number => {
    const eng = likes * 3 + comments * 4 + shares * 5 + views * 0.5;
    const rawAgeH = (now - createdAt) / 3_600_000;
    // Un post ne peut pas être "plus frais que maintenant" : une date FUTURE (seed/skew
    // d'horloge) est une donnée invalide → traitée comme ANCIENNE, sinon elle squatte le
    // #1 en permanence (bug T2M Officiel : créé +7j dans le futur → âge figé à 0).
    const ageH = rawAgeH < -1 ? 9999 : Math.max(0, rawAgeH);
    return (1 + eng) / Math.pow(ageH + 2, 1.5);
  };

  const ranked: Array<{ id: string; kind: 'post' | 'direct'; u: string; created_at: number; boost: number; s: number }> = [
    ...postRows.map((r) => ({ id: r.id, kind: 'post' as const, u: r.user_id, created_at: r.created_at, boost: r.boost, s: score(r.likes, r.cc, 0, r.views, r.created_at) })),
    ...cardRows.map((r) => ({ id: r.id, kind: 'direct' as const, u: r.user_id, created_at: r.created_at, boost: r.boost, s: score(r.likes, r.cc, r.sc, r.views, r.created_at) })),
  ];

  ranked.sort((a, b) => {
    const ba = a.boost > now ? 1 : 0;
    const bb = b.boost > now ? 1 : 0;
    if (ba !== bb) return bb - ba; // posts boostés payants d'abord (#427)
    return b.s - a.s || b.created_at - a.created_at;
  });

  // DIVERSITÉ D'AUTEUR (Pascal 2026-06-25, audit DeepSeek) : on n'empile JAMAIS le même
  // auteur. Greedy en gardant l'ordre du score : à chaque cran on prend le mieux classé
  // dont l'auteur n'est pas déjà dans les GAP derniers affichés. Évite "T2M Officiel
  // toujours #1" et "pascalrepir ×7 d'affilée", sans aucun privilège ni exclusion.
  const GAP = 3;
  const pool = ranked.slice();
  const spread: typeof ranked = [];
  while (pool.length) {
    const recent = spread.slice(-GAP).map((x) => x.u);
    let idx = pool.findIndex((it) => !recent.includes(it.u));
    if (idx === -1) idx = 0; // forcé (il ne reste que des posts du même auteur)
    spread.push(pool[idx]);
    pool.splice(idx, 1);
  }

  const page = spread.slice(offset, offset + limit).map((x) => ({ id: x.id, kind: x.kind, created_at: x.created_at }));
  return hydrateFeedKeys(page);
}

export function getMixedFeed(
  limit = 20,
  offset = 0,
  opts?: { authorIds?: string[]; sort?: 'recent' | 'popular'; commerceOnly?: boolean; friendsScope?: boolean }
): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  // Perf (#audit) : chemin par défaut "Tout" (récent, sans filtre auteur/commerce)
  // → pagination keyset SQL, on n'hydrate que la page demandée.
  if (
    (!opts?.authorIds || opts.authorIds.length === 0) &&
    !opts?.commerceOnly &&
    (opts?.sort ?? 'recent') === 'recent'
  ) {
    return getMixedFeedRecentPage(limit, offset);
  }
  // Tri Hub (Pascal 2026-06-07) : "recent" (date, défaut) ou "popular"
  // (engagement = likes×3 + vues). Filtre "Amis" : posts d'une liste d'auteurs.
  // Filtre "Shop" (commerceOnly) : posts contenant au moins une ProductCard
  // (nos conteneurs commerce — AliExpress/Bing Shopping). Dans tous ces cas on
  // élargit le pool car le bon sous-ensemble peut être épars dans le flux.
  const authorSet =
    opts?.authorIds && opts.authorIds.length ? new Set(opts.authorIds) : null;
  const sort = opts?.sort ?? 'recent';
  const commerceOnly = !!opts?.commerceOnly;
  // On charge un peu plus de chaque côté, on merge, on tranche
  const pool = authorSet || commerceOnly || sort === 'popular' ? 1000 : limit + offset;
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
  // Talk2Me #427 — un post BOOSTÉ (boosted_until > now) remonte en tête, quel
  // que soit le tri (c'est ce que le user paie depuis son Wallet).
  const nowTs = Date.now();
  const isBoosted = (d: { boosted_until?: number | null }) =>
    typeof d.boosted_until === 'number' && d.boosted_until > nowTs ? 1 : 0;
  const pop = (d: { likes?: number; views?: number }) =>
    (d.likes ?? 0) * 3 + (d.views ?? 0);
  merged.sort((a, b) => {
    const boost = isBoosted(b.data) - isBoosted(a.data);
    if (boost !== 0) return boost; // boostés d'abord
    if (sort === 'popular') return pop(b.data) - pop(a.data) || b.ts - a.ts;
    return b.ts - a.ts;
  });
  let scoped = authorSet
    ? merged.filter((m) => authorSet.has(m.data.user_id))
    : merged;
  // Plats maison (category 'plat_maison') = visibles UNIQUEMENT dans le feed Amis
  // (la mama vend à ses voisins). Hors scope Amis → on les retire (jamais public/Shop).
  if (!opts?.friendsScope) {
    scoped = scoped.filter(
      (m) => !(m.kind === 'direct' && (m.data as DbDirectCardWithAuthor).category === 'plat_maison')
    );
  }
  // Une card "commerce" = un post avec au moins une ProductCard, OU une direct
  // card avec un produit attaché (créée par un user → va dans le Shop ET reste
  // dans le Hub avec sa description). Pascal 2026-06-07.
  const isCommerce = (m: { kind: string; data: DbPostWithMessagesAndAuthor | DbDirectCardWithAuthor }) => {
    if (m.kind === 'post') {
      const msgs = (m.data as DbPostWithMessagesAndAuthor).messages;
      return (
        Array.isArray(msgs) &&
        msgs.some((msg) => Array.isArray(msg.products) && msg.products.length > 0)
      );
    }
    return !!(m.data as DbDirectCardWithAuthor).attached_product_json;
  };
  // Shop → UNIQUEMENT le commerce. Hub (Tout/Amis/Populaire) → tout, y compris
  // les cards-produit des users (elles gardent leur place avec la description).
  if (commerceOnly) scoped = scoped.filter(isCommerce);
  return scoped.slice(offset, offset + limit).map((m) =>
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
  // boutique_id IS NULL : on EXCLUT les produits du catalogue Shop (dropshipping).
  // Ce sont des cards-produit du Shop, PAS des cards publiées par l'utilisateur —
  // elles n'ont rien à faire dans l'onglet « Publiées ». (Chantier séparation Shop,
  // étape 1 : le catalogue migrera vers sa propre table shop_products.)
  const dcRows = db
    .prepare(
      `SELECT * FROM direct_cards
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
         AND boutique_id IS NULL
       ORDER BY (order_position IS NULL) ASC, order_position ASC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, n + off, 0) as any[];

  const directItems: PublishedCardItem[] = dcRows.map((r) => {
    const card = parseDirectCardRow(r);
    // Card OS (Pascal 2026-07-03) : une VITRINE (direct_card marquée [VITRINE:]) est une CARD
    // BOUTIQUE, pas une photo → « Mes Cards » l'affiche avec son identité boutique (icône + label),
    // et on masque le marqueur technique dans le titre/aperçu.
    const isVitrine = /\[VITRINE:[^\]]+\]/.test(card.caption || '');
    const isFormation = /\[FORMATION\]/.test(card.caption || '');
    const cleanCaption = (card.caption || '').replace(/\s*\[VITRINE:[^\]]+\]|\s*\[FORMATION\]/g, '').trim();
    const type: PublishedCardItem['type'] = isVitrine ? 'boutique' : isFormation ? 'formation' : card.type;
    const previewText =
      cleanCaption.length > 0
        ? cleanCaption.slice(0, 200)
        : card.text && card.text.trim().length > 0
          ? card.text.trim().slice(0, 200)
          : null;
    return {
      id: card.id,
      card_kind: 'direct_card',
      type,
      thumbnail_url: card.type === 'texte' ? null : card.media_url,
      title:
        cleanCaption.length > 0
          ? cleanCaption.slice(0, 80)
          : card.text && card.text.trim().length > 0
            ? card.text.trim().slice(0, 80)
            : null,
      preview_text: previewText,
      published_at: card.created_at,
      like_count: card.likes,
      view_count: card.views,
      order_position:
        typeof r.order_position === 'number' ? r.order_position : null,
      has_product: !!card.attached_product_json,
      has_audio: !!card.attached_audio_json,
      product: (() => {
        if (!card.attached_product_json) return null;
        try {
          const pp = JSON.parse(card.attached_product_json) as {
            title?: string;
            image_url?: string | null;
            price_label?: string | null;
            sizes?: string | null;
            wholesale?: boolean;
            source?: string;
            cj_pid?: string;
          };
          return {
            title: pp.title,
            image_url: pp.image_url ?? null,
            price_label: pp.price_label ?? null,
            sizes: pp.sizes ?? null,
            wholesale: pp.wholesale === true,
            source: pp.source,
            cj_pid: pp.cj_pid ?? null,
          };
        } catch {
          return null;
        }
      })(),
      boosted_until: card.boosted_until ?? null,
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

// ===================== Card search index (FTS5) =====================
// Talk2Me #402 — Référencement cards (Pascal 2026-06-05).
// Helpers pour la virtual table `card_search` (FTS5, unicode61). Branchés
// (a) au backfill scripts/backfill-card-index.mjs, (b) à createPost +
// createDirectCard pour indexation auto, (c) au tool search_db_posts de
// T2M Officiel pour matcher par titre/auteur/hashtags au lieu du LIKE
// texte qui ratait toutes les YT/Spotify cards.

export type CardSearchKind = 'post' | 'direct_card';

export interface CardSearchHit {
  kind: CardSearchKind;
  post_id: string;
  type: string;
  title: string;
  snippet: string;
  rank: number;
}

/**
 * Échappe une query user pour MATCH FTS5. On wrap en phrase quotée et on
 * échappe les double-quotes. Évite les crashes "fts5: syntax error" quand
 * l'user passe des opérateurs FTS (AND, OR, NOT, *, ", etc.).
 */
function escapeFts5Query(q: string): string {
  const cleaned = (q || '').trim();
  if (!cleaned) return '';
  // Split en tokens alphanumériques unicode et re-join avec espaces (FTS5
  // matche par défaut sur l'union des tokens → tolérant à l'ordre + casse).
  const tokens = cleaned
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  if (tokens.length === 0) return '';
  return tokens.join(' ');
}

/**
 * Upsert d'une card dans l'index FTS5. DELETE-then-INSERT pour rester
 * idempotent (FTS5 ne supporte pas ON CONFLICT). Appelé à la création
 * du post + au backfill + à toute modif metadata_map future.
 */
export function upsertCardSearchIndex(
  kind: CardSearchKind,
  postId: string,
  fields: {
    type: string;
    title: string;
    description: string;
    author: string;
    tags: string;
    hashtags: string;
    body: string;
  },
): void {
  if (!postId) return;
  const db = getDb();
  try {
    db.prepare('DELETE FROM card_search WHERE post_id = ? AND kind = ?').run(
      postId,
      kind,
    );
    db.prepare(
      `INSERT INTO card_search
        (post_id, kind, type, title, description, author, tags, hashtags, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      postId,
      kind,
      fields.type || '',
      fields.title || '',
      fields.description || '',
      fields.author || '',
      fields.tags || '',
      fields.hashtags || '',
      fields.body || '',
    );
  } catch (e) {
    console.warn('[db.card_search] upsert failed', kind, postId, e);
  }
}

/** Retire une card de l'index FTS5 (post supprimé / archivé). */
export function removeCardSearchIndex(
  kind: CardSearchKind,
  postId: string,
): void {
  if (!postId) return;
  const db = getDb();
  try {
    db.prepare('DELETE FROM card_search WHERE post_id = ? AND kind = ?').run(
      postId,
      kind,
    );
  } catch (e) {
    console.warn('[db.card_search] remove failed', kind, postId, e);
  }
}

/**
 * Recherche dans card_search via MATCH FTS5. Renvoie les hits ordonnés par
 * rank BM25 (plus négatif = meilleur match). Tolère opérateurs FTS spéciaux
 * (escaped). Si query vide → []. Erreur SQL → log + [].
 */
export function searchCards(
  query: string,
  limit: number = 20,
): CardSearchHit[] {
  const safeQuery = escapeFts5Query(query);
  if (!safeQuery) return [];
  const lim = Math.max(1, Math.min(limit, 50));
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT
            post_id, kind, type, title,
            snippet(card_search, 8, '[', ']', '...', 16) AS snippet,
            rank
         FROM card_search
         WHERE card_search MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(safeQuery, lim) as Array<{
      post_id: string;
      kind: CardSearchKind;
      type: string;
      title: string;
      snippet: string;
      rank: number;
    }>;
    return rows.map((r) => ({
      kind: r.kind,
      post_id: r.post_id,
      type: r.type || '',
      title: r.title || '',
      snippet: r.snippet || '',
      rank: r.rank,
    }));
  } catch (e) {
    console.warn('[db.card_search] searchCards failed', query, e);
    return [];
  }
}

/**
 * Persiste le metadata_map JSON d'un post (ou direct_card). Idempotent.
 * Best-effort : si la colonne n'existe pas (migration pas encore appliquée)
 * on swallow l'erreur. Appelé après extractCardMetadata.
 */
export function setPostMetadataMap(postId: string, mapJson: string): void {
  if (!postId) return;
  const db = getDb();
  try {
    db.prepare('UPDATE posts SET metadata_map = ? WHERE id = ?').run(
      mapJson,
      postId,
    );
  } catch (e) {
    console.warn('[db] setPostMetadataMap failed', postId, e);
  }
}

export function setDirectCardMetadataMap(cardId: string, mapJson: string): void {
  if (!cardId) return;
  const db = getDb();
  try {
    db.prepare('UPDATE direct_cards SET metadata_map = ? WHERE id = ?').run(
      mapJson,
      cardId,
    );
  } catch (e) {
    console.warn('[db] setDirectCardMetadataMap failed', cardId, e);
  }
}

// ===================== T2M Officiel helpers (search + top + buzz + stats) =====================

/**
 * Cherche dans les posts publics par mots-clés (LIKE sur messages.text +
 * messages.intent_query). Retourne posts non-deleted, non-archivés.
 *
 * NOTE Talk2Me #402 : ce path est conservé pour rétro-compat (texte brut
 * de chat). Le tool T2M Officiel `search_db_posts` utilise désormais
 * `searchCards(query)` (FTS5 sur les metadata_map) en plus.
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

// DirectCardType déjà exporté plus haut (monolithique).


