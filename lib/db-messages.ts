/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-messages — domaine « messages » (CRUD messages + parseMessageRow + acces)
 * extrait de lib/db.ts (decoupage #53/db-core, Pascal 2026-06-30). Parsers/types de
 * cartes via @/lib/db-core. Re-exporte par db.ts -> appelants inchanges.
 */
import { randomUUID } from 'crypto';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import {
  getDb, parseAttachedCards, parseJsonArray, parseMedia, parsePlaces,
  parseProducts, parseRecipe, parseTiktok, parseWeather, parseWebSearch,
  parseWikipedia, parseYoutube,
} from '@/lib/db-core';
import type {
  DbMessageMedia, DbPlace, DbProduct, DbRecipe, DbTiktok, DbWeather,
  DbWebSearch, DbWikipedia, DbYoutube,
} from '@/lib/db-core';

// ============ messages ============
// /lib/db/messages.ts — Messages CRUD + parseMessageRow.
//
// Inclut : DbMessage interface, appendMessage (avec AppendMessageExtras),
// parseMessageRow, getMessageById, getRecentMessages, updateMessagePlaces,
// getConversationMessages.


// ===================== Type =====================

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'agent';
  text: string;
  links: string[];
  created_at: number;
  youtube?: DbYoutube | null;
  places?: DbPlace[] | null;
  requires_geoloc?: boolean;
  recipe?: DbRecipe | null;
  products?: DbProduct[] | null;
  intent_query?: string | null;
  intent_label_fr?: string | null;
  user_lat?: number | null;
  user_lng?: number | null;
  wikipedia?: DbWikipedia | null;
  weather?: DbWeather | null;
  web_search?: DbWebSearch | null;
  /**
   * Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo TikTok safe filtrée par
   * les 5 garde-fous. JSON serialisé sur colonne `tiktok` (TEXT nullable).
   * Doctrine [[talktome-embeds-only]] : juste les métadonnées pour l'embed officiel.
   */
  tiktok?: DbTiktok | null;
  /** ID du message cité (reply WhatsApp-style). */
  quoted_message_id?: string | null;
  /** 'user' (humain) | 'ai_reply' (IA personnelle taguée dans le fil). */
  kind?: 'user' | 'ai_reply';
  /** ID du user owner de l'IA qui a généré ce ai_reply (Léa de qui). */
  ai_for_user_id?: string | null;
  /** Nom de l'IA qui a généré ce ai_reply (snapshot à l'instant t). */
  ai_name?: string | null;
  /** Avatar URL de l'IA qui a généré ce ai_reply (snapshot). */
  ai_avatar_url?: string | null;
  /** ID du user qui a envoyé le message (NULL legacy / agent). */
  sender_id?: string | null;
  /**
   * Talk2Me média chat (Pascal 2026-06-04) — fichier partagé dans la conv
   * (image/vidéo/audio) avec lecteur intégré + download.
   * JSON serialisé sur la colonne `media` (TEXT nullable).
   */
  media?: DbMessageMedia | null;
  /**
   * Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — array de
   * UnifiedCard que l'IA officielle ressert avec sa réponse texte.
   * Bug : "il ne sait pas me ressevir en card dorigine le contenue quil
   * a citer". JSON sérialisé sur colonne `attached_cards` (TEXT nullable).
   * Max 3 cards par message (cap dans handleOfficielMessage).
   */
  attached_cards?: UnifiedCard[] | null;
}

/**
 * Options additionnelles pour appendMessage (Talk2Me #324 — IA intégrée).
 * Toutes optionnelles, rétro-compat 100%.
 */
export interface AppendMessageExtras {
  quotedMessageId?: string | null;
  kind?: 'user' | 'ai_reply';
  aiForUserId?: string | null;
  aiName?: string | null;
  aiAvatarUrl?: string | null;
  /** ID du user qui envoie (P2P : me.id ; agent : null). */
  senderId?: string | null;
  /** E2EE : 1 → `text` est chiffré (payload iv.ciphertext), le serveur ne peut pas le lire. */
  enc?: number;
  /** Talk2Me média chat (Pascal 2026-06-04) — fichier joint. */
  media?: DbMessageMedia | null;
  /**
   * Talk2Me T2M Officiel (Pascal 2026-06-05) — cards d'origine attachées
   * à la réponse de l'IA (RE-SERT le contenu cité). Max 3.
   */
  attachedCards?: UnifiedCard[] | null;
}

// ===================== Row parser =====================

export function parseMessageRow(row: any): DbMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as 'user' | 'agent',
    text: row.text ?? '',
    links: parseJsonArray(row.links),
    created_at: row.created_at,
    youtube: parseYoutube(row.youtube),
    places: parsePlaces(row.places),
    requires_geoloc: row.requires_geoloc === 1 || row.requires_geoloc === true,
    recipe: parseRecipe(row.recipe),
    products: parseProducts(row.products),
    intent_query: typeof row.intent_query === 'string' ? row.intent_query : null,
    intent_label_fr: typeof row.intent_label_fr === 'string' ? row.intent_label_fr : null,
    user_lat: typeof row.user_lat === 'number' ? row.user_lat : null,
    user_lng: typeof row.user_lng === 'number' ? row.user_lng : null,
    wikipedia: parseWikipedia(row.wikipedia),
    weather: parseWeather(row.weather),
    web_search: parseWebSearch(row.web_search),
    tiktok: parseTiktok(row.tiktok),
    quoted_message_id:
      typeof row.quoted_message_id === 'string' ? row.quoted_message_id : null,
    kind: row.kind === 'ai_reply' ? 'ai_reply' : 'user',
    ai_for_user_id:
      typeof row.ai_for_user_id === 'string' ? row.ai_for_user_id : null,
    ai_name: typeof row.ai_name === 'string' ? row.ai_name : null,
    ai_avatar_url: typeof row.ai_avatar_url === 'string' ? row.ai_avatar_url : null,
    sender_id: typeof row.sender_id === 'string' ? row.sender_id : null,
    enc: row.enc === 1 || row.enc === true ? 1 : 0,
    media: parseMedia(row.media),
    attached_cards: parseAttachedCards(row.attached_cards),
  };
}

// ===================== Mutations =====================

export function appendMessage(
  conversationId: string,
  role: 'user' | 'agent',
  text: string,
  links: string[],
  youtube?: DbYoutube | null,
  places?: DbPlace[] | null,
  requiresGeoloc?: boolean,
  recipe?: DbRecipe | null,
  products?: DbProduct[] | null,
  wikipedia?: DbWikipedia | null,
  weather?: DbWeather | null,
  webSearch?: DbWebSearch | null,
  tiktok?: DbTiktok | null,
  extras?: AppendMessageExtras
): DbMessage {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const linksJson = JSON.stringify(links || []);
  const youtubeJson = youtube === undefined ? null : JSON.stringify(youtube);
  const placesJson =
    places === undefined || places === null ? null : JSON.stringify(places);
  const geolocFlag = requiresGeoloc ? 1 : 0;
  const recipeJson =
    recipe === undefined || recipe === null ? null : JSON.stringify(recipe);
  const productsJson =
    products === undefined || products === null ? null : JSON.stringify(products);
  const wikipediaJson =
    wikipedia === undefined || wikipedia === null ? null : JSON.stringify(wikipedia);
  const weatherJson =
    weather === undefined || weather === null ? null : JSON.stringify(weather);
  const webSearchJson =
    webSearch === undefined || webSearch === null ? null : JSON.stringify(webSearch);
  const tiktokJson =
    tiktok === undefined || tiktok === null ? null : JSON.stringify(tiktok);

  const quotedId = extras?.quotedMessageId ?? null;
  const kindVal = extras?.kind === 'ai_reply' ? 'ai_reply' : 'user';
  const aiForUserId = extras?.aiForUserId ?? null;
  const aiNameVal = extras?.aiName ?? null;
  const aiAvatarUrlVal = extras?.aiAvatarUrl ?? null;
  const senderIdVal = extras?.senderId ?? null;
  const mediaJson =
    extras?.media === undefined || extras?.media === null
      ? null
      : JSON.stringify(extras.media);
  // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — sérialise
  // l'array de UnifiedCard (cap 3 enforced côté handler). null si vide.
  const attachedCardsJson =
    extras?.attachedCards === undefined ||
    extras?.attachedCards === null ||
    extras.attachedCards.length === 0
      ? null
      : JSON.stringify(extras.attachedCards.slice(0, 3));

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, text, links, created_at, youtube, places, requires_geoloc, recipe, products, wikipedia, weather, web_search, tiktok, quoted_message_id, kind, ai_for_user_id, ai_name, ai_avatar_url, sender_id, media, attached_cards, enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    conversationId,
    role,
    text,
    linksJson,
    now,
    youtubeJson,
    placesJson,
    geolocFlag,
    recipeJson,
    productsJson,
    wikipediaJson,
    weatherJson,
    webSearchJson,
    tiktokJson,
    quotedId,
    kindVal,
    aiForUserId,
    aiNameVal,
    aiAvatarUrlVal,
    senderIdVal,
    mediaJson,
    attachedCardsJson,
    extras?.enc ? 1 : 0
  );

  // Phase 3 : maj preview conversation pour la liste /messages.
  try {
    // E2EE : ne JAMAIS mettre le chiffré en preview (illisible + fuite). Placeholder à la place.
    let preview = extras?.enc ? '🔒 Message chiffré' : (text || '').trim().slice(0, 140);
    if (!preview && extras?.media) {
      const t = extras.media.type;
      preview = t === 'image' ? '📷 Image' : t === 'video' ? '🎥 Vidéo' : '🎵 Audio';
    }
    db.prepare(
      'UPDATE conversations SET last_message_preview = ?, last_message_at = ? WHERE id = ?'
    ).run(preview, now, conversationId);
  } catch {
    // colonnes absentes (très anciennes DB pré-migration) : ignore
  }

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
  return parseMessageRow(row);
}

/**
 * Talk2Me #324 — Récupère un message par son id (sans vérification d'accès).
 * Utilisé pour résoudre le quoted_message_id côté backend (prompt IA).
 */
export function getMessageById(messageId: string): DbMessage | null {
  if (!messageId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any;
  return row ? parseMessageRow(row) : null;
}

/**
 * Talk2Me #324 — Récupère les N derniers messages d'une conversation
 * (chronologique ASC), pour fournir le contexte à l'IA.
 */
export function getRecentMessages(conversationId: string, limit = 8): DbMessage[] {
  if (!conversationId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(conversationId, Math.max(1, Math.min(50, limit))) as any[];
  return rows.map(parseMessageRow).reverse();
}

/**
 * Met à jour les colonnes places, requires_geoloc et metadata intent d'un
 * message existant. Utilisé après exécution côté client d'une PlaceSearch
 * (geoloc nav) pour conserver l'intent_query et la position utilisateur
 * afin que les deep-links Maps restent contextualisés à la reconnexion.
 */
export function updateMessagePlaces(
  messageId: string,
  places: unknown[] | null,
  requiresGeoloc: boolean,
  intentQuery?: string | null,
  intentLabelFr?: string | null,
  userLat?: number | null,
  userLng?: number | null
): boolean {
  const db = getDb();
  const placesJson = places === null ? null : JSON.stringify(places);
  const geolocFlag = requiresGeoloc ? 1 : 0;
  const result = db
    .prepare(
      'UPDATE messages SET places = ?, requires_geoloc = ?, intent_query = COALESCE(?, intent_query), intent_label_fr = COALESCE(?, intent_label_fr), user_lat = COALESCE(?, user_lat), user_lng = COALESCE(?, user_lng) WHERE id = ?'
    )
    .run(
      placesJson,
      geolocFlag,
      intentQuery ?? null,
      intentLabelFr ?? null,
      typeof userLat === 'number' ? userLat : null,
      typeof userLng === 'number' ? userLng : null,
      messageId
    );
  return result.changes > 0;
}

export function getConversationMessages(conversationId: string): DbMessage[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(conversationId) as any[];

  return rows.map(parseMessageRow);
}

// Talk2Me #22 — un user peut-il agir sur cette conversation ? (propriétaire solo
// OU participant d'un groupe/P2P). Sert à sécuriser la suppression de message.
export function userCanAccessConversation(conversationId: string, userId: string): boolean {
  if (!conversationId || !userId) return false;
  const db = getDb();
  const owner = db.prepare('SELECT user_id FROM conversations WHERE id = ?').get(conversationId) as { user_id?: string } | undefined;
  if (owner?.user_id === userId) return true;
  const part = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1').get(conversationId, userId);
  return !!part;
}

// Talk2Me #22 — soft-delete d'un message. Retourne true si supprimé.
// Règle : le user doit avoir accès à la conversation. Dans une conv multi-user
// (P2P/groupe), on ne supprime QUE ses propres messages (role='user' + sa conv).
export function softDeleteMessage(messageId: string, userId: string): boolean {
  if (!messageId || !userId) return false;
  const db = getDb();
  const msg = db.prepare('SELECT id, conversation_id, role FROM messages WHERE id = ? AND deleted_at IS NULL').get(messageId) as { id: string; conversation_id: string; role: string } | undefined;
  if (!msg) return false;
  if (!userCanAccessConversation(msg.conversation_id, userId)) return false;
  const conv = db.prepare('SELECT user_id FROM conversations WHERE id = ?').get(msg.conversation_id) as { user_id?: string } | undefined;
  const isSoloOwner = conv?.user_id === userId;
  // Conv solo (moi + mon IA) : je peux tout effacer. Conv partagée : seulement les miens.
  if (!isSoloOwner && msg.role !== 'user') return false;
  const r = db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(Date.now(), messageId);
  return r.changes > 0;
}

