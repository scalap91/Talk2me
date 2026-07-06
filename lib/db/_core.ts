// /lib/db/_core.ts — singleton DB + migrations + helpers JSON partagés.
//
// Pascal 2026-06-05 : split du monolithe lib/db.ts (~4700 lignes) en modules
// par domaine sous /lib/db/. Compat ascendante stricte via barrel + re-export.
// ZÉRO changement comportement : code déplacé tel quel, juste réparti.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import type { UnifiedCard } from '@/lib/embed-hub/types';

// ===================== Types JSON partagés (interfaces lisibles) =====================
// Ces interfaces décrivent les payloads sérialisés sur les colonnes JSON de
// la table messages. Elles sont utilisées par parseMessageRow (messages.ts)
// et exposées au public (consommées par les routes API + tools IA).

export interface DbYoutube {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string;
}

export interface DbPlaceOpenStatus {
  is_open: boolean | null;
  label: string | null;
}

export interface DbPlace {
  name: string;
  category: string;
  cuisine: string | null;
  address: string | null;
  distance_m: number;
  maps_url: string;
  google_maps_url: string;
  directions_url?: string;
  source_url?: string;
  website?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  opening_hours_raw?: string | null;
  open_status?: DbPlaceOpenStatus | null;
  image_url?: string | null;
  lat: number;
  lng: number;
}

export interface DbRecipe {
  name: string;
  image: string | null;
  prep_time: string | null;
  servings: string | null;
  difficulty: string | null;
  ingredients: string[];
  description: string | null;
  source_url: string;
  source: 'marmiton' | 'cuisineaz';
}

export interface DbProduct {
  id: string;
  title: string;
  image_url: string | null;
  price_label: string | null;
  currency: string | null;
  source: 'AliExpress' | 'Bing Shopping' | 'CJ' | 'Talk2Me' | 'SHEIN' | 'TEMU';
  source_url: string;
  condition: 'neuf' | null;
}

export interface DbWikipedia {
  title: string;
  extract: string;
  thumbnail: string | null;
  page_url: string;
  lang: string;
  source: 'wikipedia';
}

export interface DbWeather {
  temperature_c: number;
  feels_like_c: number | null;
  condition_label: string;
  icon: string;
  wind_kmh: number | null;
  humidity_pct: number | null;
  source: 'open-meteo';
  source_url: string;
  observed_at: string;
  lat: number;
  lng: number;
  place_label: string | null;
}

export interface DbWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  favicon?: string;
  thumbnail?: string;
}

export interface DbWebSearch {
  results: DbWebSearchResult[];
  source: 'brave' | 'bing' | 'ddg' | 'none';
}

/**
 * Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo TikTok safe.
 * Doctrine [[talktome-embeds-only]] : on persiste juste les métadonnées
 * (video_id + user + cover) pour render le lecteur officiel TikTok à l'affichage.
 * Filtrée par les 5 garde-fous côté handler avant insertion.
 */
export interface DbTiktok {
  video_id: string;
  user: string;
  user_nickname: string;
  title: string;
  cover_url: string | null;
  original_url: string;
  play_count: number | null;
  digg_count: number | null;
  duration: number | null;
}

/**
 * Talk2Me — payload média attaché à un message (Pascal 2026-06-04).
 */
export interface DbMessageMedia {
  url: string;
  type: 'image' | 'video' | 'audio';
  filename?: string | null;
  size?: number | null;
  mime?: string | null;
  poster?: string | null;
}

// Re-export du type UnifiedCard pour que les consumers du barrel y aient
// accès sans avoir à importer embed-hub directement.
export type { UnifiedCard };

// ===================== Singleton DB + migrations =====================

const DB_PATH = process.cwd() + '/data/talktome.db';
const DB_DIR = path.dirname(DB_PATH);

export function getDb(): Database.Database {
  if (!(globalThis as any).__talktomeDb) {
    // Ensure directory exists
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);

    // Enable WAL mode and foreign keys
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create tables idempotently
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        talk2me_id TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        password_hash TEXT,
        created_at INTEGER NOT NULL,
        last_seen INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_talk2me_id ON users(talk2me_id);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS magic_links (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        user_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_links(email);
      CREATE INDEX IF NOT EXISTS idx_magic_expires ON magic_links(expires_at);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT,
        links TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
      CREATE TABLE IF NOT EXISTS direct_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        media_url TEXT,
        caption TEXT,
        text TEXT,
        bg_variant TEXT,
        created_at INTEGER NOT NULL,
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_direct_cards_created ON direct_cards(created_at DESC);

      -- Phase 1 cleanup : Watch Together par lien supprimé (cf doctrine
      -- talktome-multi-user-temps-reel). Les anciennes tables sont dropées.
      DROP TABLE IF EXISTS watch_chat_messages;
      DROP TABLE IF EXISTS watch_sessions;

      -- Phase 2 multi-user : graphe d'amitié (symétrique, paire normalisée).
      -- user_a < user_b lexicographiquement pour rendre la paire unique.
      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'accepted',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_a) REFERENCES users(id),
        FOREIGN KEY (user_b) REFERENCES users(id),
        UNIQUE(user_a, user_b)
      );
      CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a);
      CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);

      -- Phase 3 multi-user temps réel : participants conversation + présence.
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        last_read_at INTEGER,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_conv_part_user ON conversation_participants(user_id);

      CREATE TABLE IF NOT EXISTS presence (
        user_id TEXT PRIMARY KEY,
        last_seen INTEGER NOT NULL,
        status TEXT DEFAULT 'online',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Phase 5 multi-user temps réel : activités synchronisées greffées
      -- sur une conversation (typiquement pendant un appel actif).
      -- state = JSON type-spécifique (cf lib/activity-types.ts).
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        conv_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        started_by TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_activities_conv ON activities(conv_id);
      CREATE INDEX IF NOT EXISTS idx_activities_active
        ON activities(conv_id, ended_at);

      -- Talk2Me #326 — IA personnelle persistante : mémoire long terme par user
      -- (préférences, habitudes, faits, style). Injecté dans le system prompt
      -- du call IA pour personnaliser les réponses au OWNER de l'IA.
      -- Doctrine [[talktome-ia-persistance-isolation]] : strictement isolé par
      -- user_id (jamais leaké à un peer).
      CREATE TABLE IF NOT EXISTS ai_memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT DEFAULT 'preference',
        content TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        source_conv_id TEXT,
        source_message_id TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_aimem_user ON ai_memories(user_id);

      -- Talk2Me #338 — Habitudes utilisateur apprises (Pascal 2026-06-04).
      -- Doctrine [[talk2me-roadmap-6-phases]] Phase 1 + master prompt point 12.
      -- Apprentissage passif des préférences (musique, lieux, sujets, cuisine,
      -- contacts) pour désambiguïsation grounded ("Mets-moi Check" + user
      -- écoute rap → query enrichie "Young Thug Check").
      -- STRICTEMENT isolé par user_id (cf [[talktome-ia-persistance-isolation]]).
      CREATE TABLE IF NOT EXISTS user_habits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        score REAL DEFAULT 1.0,
        occurrences INTEGER DEFAULT 1,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        source TEXT,
        metadata TEXT,
        UNIQUE(user_id, kind, value)
      );
      CREATE INDEX IF NOT EXISTS idx_user_habits_user_kind ON user_habits(user_id, kind, score DESC);
      CREATE INDEX IF NOT EXISTS idx_user_habits_user_lastseen ON user_habits(user_id, last_seen_at DESC);

      -- Talk2Me #331 — Cards réutilisables (Pascal 2026-06-04).
      -- Doctrine [[talktome-conversation-avant-recherche]] : chaque card IA
      -- peut être enregistrée (bookmark), modifiée, ou forwardée à un ami.
      -- card_data = JSON snapshot complet de la card (youtube/place/recipe/etc.)
      CREATE TABLE IF NOT EXISTS saved_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_message_id TEXT,
        source_conv_id TEXT,
        card_kind TEXT NOT NULL,
        card_data TEXT NOT NULL,
        title TEXT,
        note TEXT,
        saved_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_cards(user_id, saved_at DESC);

      -- Talk2Me #334 — Brouillons de cards (Pascal 2026-06-04).
      -- Doctrine [[talk2me-card-editor-ia]] : "L'utilisateur peut quitter et
      -- reprendre l'édition (auto-save brouillon)". draft_data = JSON snapshot
      -- complet du store (type='image'|'video'|'texte', source_url, crop, filter,
      -- texts, title, description, hashtags, trim, cover_time_s, etc.).
      CREATE TABLE IF NOT EXISTS card_drafts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        draft_data TEXT NOT NULL,
        thumbnail_url TEXT,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_card_drafts_user ON card_drafts(user_id, updated_at DESC);

      -- Talk2Me #379 — T2M Officiel IA institutionnelle (Pascal 2026-06-05).
      -- Doctrine [[talk2me-officiel-ia]] : tuto interactif + docs légaux servis
      -- par l'IA institutionnelle, DB-only, aucun appel externe.
      CREATE TABLE IF NOT EXISTS tutorial_steps (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        media_url TEXT,
        next_action TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tutorial_topic ON tutorial_steps(topic, step_order);

      CREATE TABLE IF NOT EXISTS legal_docs (
        topic TEXT PRIMARY KEY,
        content_md TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Phase 3 : extensions colonnes conversations (kind, created_by, preview…)
    try { db.exec("ALTER TABLE conversations ADD COLUMN kind TEXT DEFAULT 'agent'"); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE conversations ADD COLUMN created_by TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE conversations ADD COLUMN last_message_preview TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE conversations ADD COLUMN last_message_at INTEGER'); } catch { /* déjà */ }

    // Migration forward-only : pour chaque conversation existante (kind=null
    // = ancienne table) on s'assure que kind='agent' et que le user_id est
    // bien inscrit dans conversation_participants.
    try {
      db.exec("UPDATE conversations SET kind='agent' WHERE kind IS NULL");
      const orphans = db
        .prepare(
          `SELECT c.id AS cid, c.user_id AS uid, c.created_at AS cat
             FROM conversations c
             LEFT JOIN conversation_participants p
               ON p.conversation_id = c.id AND p.user_id = c.user_id
             WHERE p.conversation_id IS NULL AND c.user_id IS NOT NULL`
        )
        .all() as Array<{ cid: string; uid: string; cat: number }>;
      const ins = db.prepare(
        'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
      );
      for (const o of orphans) {
        ins.run(o.cid, o.uid, o.cat || Date.now());
      }
    } catch (e) {
      console.warn('[db] phase3 conversations migration skipped:', e);
    }

    // Ajout idempotent de la colonne youtube
    try { db.exec('ALTER TABLE messages ADD COLUMN youtube TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN places TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN requires_geoloc INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN recipe TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN products TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN intent_query TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN intent_label_fr TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN user_lat REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN user_lng REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN wikipedia TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN weather TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN web_search TEXT'); } catch { /* déjà */ }
    // Talk2Me search_tiktok (Pascal 2026-06-04)
    try { db.exec('ALTER TABLE messages ADD COLUMN tiktok TEXT'); } catch { /* déjà */ }
    // Talk2Me #324 — IA personnelle intégrée dans le fil P2P (migrations).
    try { db.exec("ALTER TABLE users ADD COLUMN ai_name TEXT"); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE users ADD COLUMN ai_avatar_url TEXT'); } catch { /* déjà */ }
    // Talk2Me #325 — genre de l'IA personnelle (feminin/masculin/neutre).
    try { db.exec("ALTER TABLE users ADD COLUMN ai_gender TEXT DEFAULT 'neutre'"); } catch { /* déjà */ }
    try { db.exec("UPDATE users SET ai_gender = 'neutre' WHERE ai_gender IS NULL OR ai_gender = ''"); } catch { /* ignore */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN quoted_message_id TEXT'); } catch { /* déjà */ }
    try { db.exec("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'user'"); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN ai_for_user_id TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN ai_name TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN ai_avatar_url TEXT'); } catch { /* déjà */ }
    // Talk2Me #324 — sender_id
    try { db.exec('ALTER TABLE messages ADD COLUMN sender_id TEXT'); } catch { /* déjà */ }
    // Talk2Me média chat
    try { db.exec('ALTER TABLE messages ADD COLUMN media TEXT'); } catch { /* déjà */ }
    // Talk2Me T2M Officiel cards attachées
    try { db.exec('ALTER TABLE messages ADD COLUMN attached_cards TEXT'); } catch { /* déjà */ }
    // Rétro-fill ai_name : "T2M de <display_name>" si NULL/vide
    try {
      db.exec(
        "UPDATE users SET ai_name = 'T2M de ' || COALESCE(NULLIF(TRIM(display_name), ''), username) WHERE ai_name IS NULL OR ai_name = ''"
      );
    } catch { /* ignore */ }
    // Rétro-fill messages.kind
    try { db.exec("UPDATE messages SET kind = 'user' WHERE kind IS NULL OR kind = ''"); } catch { /* ignore */ }
    // email
    try { db.exec('ALTER TABLE users ADD COLUMN email TEXT'); } catch { /* déjà */ }
    // Talk2Me #338 — décay habitudes
    try { db.exec('ALTER TABLE users ADD COLUMN last_habits_decay_at INTEGER'); } catch { /* déjà */ }
    // Talk2Me PII air-gap
    try { db.exec('ALTER TABLE users ADD COLUMN last_pii_clean_at INTEGER'); } catch { /* déjà */ }
    // avatar_url
    try { db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch { /* déjà */ }
    // Migration password_hash NOT NULL → nullable
    try {
      const usersSchema = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
        .get() as { sql?: string } | undefined;
      if (usersSchema?.sql && /password_hash[^,]*NOT NULL/i.test(usersSchema.sql)) {
        db.pragma('foreign_keys = OFF');
        const tx = db.transaction(() => {
          db.exec(`
            CREATE TABLE users_new (
              id TEXT PRIMARY KEY,
              talk2me_id TEXT UNIQUE NOT NULL,
              username TEXT UNIQUE NOT NULL,
              display_name TEXT,
              password_hash TEXT,
              created_at INTEGER NOT NULL,
              last_seen INTEGER,
              email TEXT
            );
            INSERT INTO users_new (id, talk2me_id, username, display_name, password_hash, created_at, last_seen, email)
              SELECT id, talk2me_id, username, display_name, password_hash, created_at, last_seen, email FROM users;
            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_talk2me_id ON users(talk2me_id);
          `);
        });
        tx();
        db.pragma('foreign_keys = ON');
      }
    } catch (e) {
      console.warn('[db] users password_hash nullable migration skipped:', e);
    }
    // Index unique case-insensitive sur email
    try {
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL'
      );
    } catch { /* ignore */ }

    // =================== Talk2Me Lot A — CRUD Cards complet ===================
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN archived_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN deleted_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN share_count INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN save_count INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN comment_count INTEGER DEFAULT 0'); } catch { /* déjà */ }

    try { db.exec('ALTER TABLE posts ADD COLUMN archived_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE posts ADD COLUMN deleted_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE posts ADD COLUMN share_count INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE posts ADD COLUMN save_count INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE posts ADD COLUMN comment_count INTEGER DEFAULT 0'); } catch { /* déjà */ }

    // Talk2Me #383 (Pascal 2026-06-05) — ordre custom utilisateur sur ses cards
    try { db.exec('ALTER TABLE posts ADD COLUMN order_position INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN order_position INTEGER'); } catch { /* déjà */ }

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS card_likes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          card_kind TEXT NOT NULL,
          card_id TEXT NOT NULL,
          liked_at INTEGER NOT NULL,
          UNIQUE(user_id, card_kind, card_id)
        );
        CREATE INDEX IF NOT EXISTS idx_card_likes_card ON card_likes(card_kind, card_id);
        CREATE INDEX IF NOT EXISTS idx_card_likes_user ON card_likes(user_id, liked_at DESC);
      `);
    } catch (e) {
      console.warn('[db] card_likes migration skipped:', e);
    }

    // Talk2Me #340 — Apprentissage per-user des routes intent → tool_chain.
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS route_learnings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          intent TEXT NOT NULL,
          tool_chain TEXT NOT NULL,
          success_score REAL DEFAULT 0,
          last_used_at INTEGER NOT NULL,
          occurrences INTEGER DEFAULT 1,
          UNIQUE(user_id, intent, tool_chain)
        );
        CREATE INDEX IF NOT EXISTS idx_route_learnings_user_intent
          ON route_learnings(user_id, intent, success_score DESC);
        CREATE INDEX IF NOT EXISTS idx_route_learnings_user_lastused
          ON route_learnings(user_id, last_used_at DESC);
      `);
    } catch (e) {
      console.warn('[db] route_learnings migration skipped:', e);
    }

    (globalThis as any).__talktomeDb = db;
  }

  return (globalThis as any).__talktomeDb;
}

// ===================== Helpers JSON partagés =====================
// Utilisés par parseMessageRow (messages.ts) et certains autres modules.

/** Helper to safely parse JSON array */
export function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Talk2Me T2M Officiel (Pascal 2026-06-05) — Parse JSON array de UnifiedCard.
 * Tolère absence/null/JSON cassé : retourne null. Validation minimale (objet
 * avec source + type + title) — pas de schéma strict, l'UI gère ses fallbacks
 * via UnifiedCardRenderer + FallbackCard.
 */
export function parseAttachedCards(value: string | null | undefined): UnifiedCard[] | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!Array.isArray(p)) return null;
    const out: UnifiedCard[] = [];
    for (const item of p) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (typeof o.source !== 'string' || typeof o.title !== 'string') continue;
      out.push(item as UnifiedCard);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function parseMedia(value: string | null | undefined): DbMessageMedia | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (typeof o.url !== 'string' || !o.url) return null;
    const type = o.type === 'image' || o.type === 'video' || o.type === 'audio' ? o.type : null;
    if (!type) return null;
    return {
      url: o.url,
      type,
      filename: typeof o.filename === 'string' ? o.filename : null,
      size: typeof o.size === 'number' ? o.size : null,
      mime: typeof o.mime === 'string' ? o.mime : null,
      poster: typeof o.poster === 'string' ? o.poster : null,
    };
  } catch {
    return null;
  }
}

export function parseTiktok(value: string | null | undefined): DbTiktok | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (typeof o.video_id !== 'string' || !o.video_id) return null;
    if (typeof o.user !== 'string' || !o.user) return null;
    if (typeof o.original_url !== 'string') return null;
    return {
      video_id: o.video_id,
      user: o.user,
      user_nickname: typeof o.user_nickname === 'string' ? o.user_nickname : o.user,
      title: typeof o.title === 'string' ? o.title : '',
      cover_url: typeof o.cover_url === 'string' ? o.cover_url : null,
      original_url: o.original_url,
      play_count: typeof o.play_count === 'number' ? o.play_count : null,
      digg_count: typeof o.digg_count === 'number' ? o.digg_count : null,
      duration: typeof o.duration === 'number' ? o.duration : null,
    };
  } catch {
    return null;
  }
}

export function parseWebSearch(value: string | null | undefined): DbWebSearch | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (!Array.isArray(o.results)) return null;
    const src = o.source;
    const source: DbWebSearch['source'] =
      src === 'brave' ? 'brave' : src === 'bing' ? 'bing' : src === 'ddg' ? 'ddg' : 'none';
    const out: DbWebSearchResult[] = [];
    for (const item of o.results) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (typeof r.title !== 'string' || typeof r.url !== 'string') continue;
      out.push({
        title: r.title,
        url: r.url,
        snippet: typeof r.snippet === 'string' ? r.snippet : '',
        source: typeof r.source === 'string' ? r.source : undefined,
        favicon: typeof r.favicon === 'string' ? r.favicon : undefined,
        thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : undefined,
      });
    }
    if (out.length === 0) return null;
    return { results: out, source };
  } catch {
    return null;
  }
}

export function parseWikipedia(value: string | null | undefined): DbWikipedia | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (typeof o.title !== 'string' || typeof o.extract !== 'string') return null;
    return {
      title: o.title,
      extract: o.extract,
      thumbnail: typeof o.thumbnail === 'string' ? o.thumbnail : null,
      page_url: typeof o.page_url === 'string' ? o.page_url : '',
      lang: typeof o.lang === 'string' ? o.lang : 'fr',
      source: 'wikipedia',
    };
  } catch {
    return null;
  }
}

export function parseWeather(value: string | null | undefined): DbWeather | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    if (typeof o.temperature_c !== 'number' || typeof o.condition_label !== 'string') return null;
    return {
      temperature_c: o.temperature_c,
      feels_like_c: typeof o.feels_like_c === 'number' ? o.feels_like_c : null,
      condition_label: o.condition_label,
      icon: typeof o.icon === 'string' ? o.icon : '🌡️',
      wind_kmh: typeof o.wind_kmh === 'number' ? o.wind_kmh : null,
      humidity_pct: typeof o.humidity_pct === 'number' ? o.humidity_pct : null,
      source: 'open-meteo',
      source_url: typeof o.source_url === 'string' ? o.source_url : 'https://open-meteo.com/',
      observed_at: typeof o.observed_at === 'string' ? o.observed_at : new Date().toISOString(),
      lat: typeof o.lat === 'number' ? o.lat : 0,
      lng: typeof o.lng === 'number' ? o.lng : 0,
      place_label: typeof o.place_label === 'string' ? o.place_label : null,
    };
  } catch {
    return null;
  }
}

export function parseProducts(value: string | null | undefined): DbProduct[] | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const out: DbProduct[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.id !== 'string' || typeof p.title !== 'string') continue;
      if (typeof p.source_url !== 'string') continue;
      out.push({
        id: p.id,
        title: p.title,
        image_url: typeof p.image_url === 'string' ? p.image_url : null,
        price_label: typeof p.price_label === 'string' ? p.price_label : null,
        currency: typeof p.currency === 'string' ? p.currency : null,
        source: p.source === 'Bing Shopping' ? 'Bing Shopping' : 'AliExpress',
        source_url: p.source_url,
        condition: p.condition === 'neuf' ? 'neuf' : null,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function parseRecipe(value: string | null | undefined): DbRecipe | null {
  if (value === null || value === undefined) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const obj = p as Record<string, unknown>;
    if (typeof obj.name !== 'string' || typeof obj.source_url !== 'string') return null;
    const source =
      obj.source === 'marmiton' || obj.source === 'cuisineaz' ? obj.source : 'marmiton';
    return {
      name: obj.name,
      image: typeof obj.image === 'string' ? obj.image : null,
      prep_time: typeof obj.prep_time === 'string' ? obj.prep_time : null,
      servings: typeof obj.servings === 'string' ? obj.servings : null,
      difficulty: typeof obj.difficulty === 'string' ? obj.difficulty : null,
      ingredients: Array.isArray(obj.ingredients)
        ? obj.ingredients.filter((s): s is string => typeof s === 'string')
        : [],
      description: typeof obj.description === 'string' ? obj.description : null,
      source_url: obj.source_url,
      source,
    };
  } catch {
    return null;
  }
}

export function parsePlaces(value: string | null | undefined): DbPlace[] | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const out: DbPlace[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.name !== 'string') continue;
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      let openStatus: DbPlaceOpenStatus | null = null;
      const rawStatus = p.open_status;
      if (rawStatus && typeof rawStatus === 'object') {
        const s = rawStatus as Record<string, unknown>;
        const isOpen =
          typeof s.is_open === 'boolean' ? s.is_open : s.is_open === null ? null : null;
        const label = typeof s.label === 'string' ? s.label : null;
        openStatus = { is_open: isOpen, label };
      }
      out.push({
        name: p.name,
        category: typeof p.category === 'string' ? p.category : 'place',
        cuisine: typeof p.cuisine === 'string' ? p.cuisine : null,
        address: typeof p.address === 'string' ? p.address : null,
        distance_m: typeof p.distance_m === 'number' ? p.distance_m : 0,
        maps_url: typeof p.maps_url === 'string' ? p.maps_url : '',
        google_maps_url: typeof p.google_maps_url === 'string' ? p.google_maps_url : '',
        directions_url: typeof p.directions_url === 'string' ? p.directions_url : undefined,
        source_url: typeof p.source_url === 'string' ? p.source_url : undefined,
        website: typeof p.website === 'string' ? p.website : null,
        phone: typeof p.phone === 'string' ? p.phone : null,
        opening_hours: typeof p.opening_hours === 'string' ? p.opening_hours : null,
        opening_hours_raw:
          typeof p.opening_hours_raw === 'string' ? p.opening_hours_raw : null,
        open_status: openStatus,
        image_url: typeof p.image_url === 'string' ? p.image_url : null,
        lat: p.lat,
        lng: p.lng,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Helper to parse youtube JSON string
 * Returns undefined si absent (colonne NULL), null si volontairement null (= not_found),
 * objet DbYoutube si vidéo trouvée.
 */
export function parseYoutube(value: string | null | undefined): DbYoutube | null | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.video_id === 'string' &&
      typeof parsed.title === 'string' &&
      typeof parsed.channel === 'string' &&
      typeof parsed.thumbnail === 'string'
    ) {
      return {
        video_id: parsed.video_id,
        title: parsed.title,
        channel: parsed.channel,
        description: typeof parsed.description === 'string' ? parsed.description : '',
        thumbnail: parsed.thumbnail,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
