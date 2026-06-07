// /lib/db.ts (monolithic — Pascal 2026-06-05 #401)
// Restauré du split #397 pour fixer le tree-shaking Turbopack qui éliminait
// silencieusement updatePresence/getPresences/getOrCreateAgentConversation.
// Les fichiers source restent dans /lib/db/<module>.ts pour navigation.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
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

// ============ _core ============
// /lib/db/_core.ts — singleton DB + migrations + helpers JSON partagés.
//
// Pascal 2026-06-05 : split du monolithe lib/db.ts (~4700 lignes) en modules
// par domaine sous /lib/db/. Compat ascendante stricte via barrel + re-export.
// ZÉRO changement comportement : code déplacé tel quel, juste réparti.





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
  source: 'AliExpress' | 'Bing Shopping';
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

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
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

    // Talk2Me #402 — Référencement cards (Pascal 2026-06-05).
    // Verbatim Pascal : "il devrait trouver Young thug car il est dans la
    // DB en card donc on référence mal les cards il faut un module
    // référencement qui s'occupe de récupérer les descriptions les titres
    // les hashtags pour les recevoir dans les recherches".
    //
    // 1. metadata_map : JSON typé CardMetadataMap stocké à la création
    //    du post / direct_card (cf lib/search/metadata-map.ts).
    // 2. card_search : virtual table FTS5 (unicode61 remove_diacritics 2)
    //    pour recherche accent/case-insensitive sur titre + description +
    //    auteur + tags + hashtags + body.
    try { db.exec('ALTER TABLE posts ADD COLUMN metadata_map TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN metadata_map TEXT'); } catch { /* déjà */ }
    // Talk2Me #422 — Musique attachée à une VideoCard via music-hub.
    // JSON UnifiedCard (music) sérialisée. NULL si pas de musique.
    try { db.exec('ALTER TABLE posts ADD COLUMN attached_audio_json TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN attached_audio_json TEXT'); } catch { /* déjà */ }
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS card_search USING fts5(
          post_id UNINDEXED,
          kind UNINDEXED,
          type,
          title,
          description,
          author,
          tags,
          hashtags,
          body,
          tokenize='unicode61 remove_diacritics 2'
        );
      `);
    } catch (e) {
      console.warn('[db] card_search FTS5 migration skipped:', e);
    }

    // Talk2Me #405 — AI Fuzz Tester (Pascal 2026-06-05).
    // Doctrine [[feedback-fuzz-rapport-obligatoire]] : tout fuzz produit un
    // rapport .md + compteur effets de bord. Doctrine [[feedback-emails-test-
    // blocklist]] : emails fuzz exclusivement @test.com ou +fuzz.
    //
    // fuzz_regression : un bug détecté = une ligne. Si re-détecté → fail_count++.
    //                   Si la suite repasse → pass_count++, status='fixed'.
    // fuzz_run        : métadonnées d'une exécution de fuzz (pour dashboard).
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fuzz_regression (
          id TEXT PRIMARY KEY,
          profile TEXT NOT NULL,
          prompt TEXT NOT NULL,
          expected_intent TEXT,
          expected_tool TEXT,
          expected_card_kind TEXT,
          forbidden_patterns TEXT,
          required_patterns TEXT,
          first_seen_at INTEGER NOT NULL,
          last_pass_at INTEGER,
          last_fail_at INTEGER,
          fail_count INTEGER DEFAULT 0,
          pass_count INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open',
          last_fail_reason TEXT,
          last_response_excerpt TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_fuzz_regression_status
          ON fuzz_regression(status, last_fail_at DESC);
        CREATE INDEX IF NOT EXISTS idx_fuzz_regression_profile
          ON fuzz_regression(profile, fail_count DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_fuzz_regression_unique
          ON fuzz_regression(profile, prompt);

        CREATE TABLE IF NOT EXISTS fuzz_run (
          id TEXT PRIMARY KEY,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          profiles_run TEXT NOT NULL,
          total_prompts INTEGER,
          pass_count INTEGER,
          fail_count INTEGER,
          report_md_path TEXT,
          rate_limit_ms INTEGER,
          side_effects TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_fuzz_run_started
          ON fuzz_run(started_at DESC);
      `);
    } catch (e) {
      console.warn('[db] fuzz_tester migration skipped:', e);
    }

    // Talk2Me #406 + #407 — AI Ops platform (Pascal 2026-06-05).
    // - Red Team Pipeline H24 (Generator → Léa → Critic → Fix → Judge)
    // - Agent perf tracking (registry, missions, scores, perf_daily)
    // - Patch queue (Fix Agent → Pascal review via Telegram + admin UI)
    // Doctrines :
    //  [[feedback-fuzz-rapport-obligatoire]] : rapport markdown + side-effects
    //  [[feedback-watchdog-pipeline]] : aboie Telegram si bug critique
    //  [[feedback-modular-no-scattered-patches]] : 1 module ai-ops/, pas éparpillé
    //  [[talk2me-pii-air-gap]] : fake users isolés (fuzz+@test.com)
    //  [[project-bizzi-no-funding]] : default 10 cycles/h (~$30/mois)
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_registry (
          id TEXT PRIMARY KEY,
          role TEXT NOT NULL,
          model TEXT NOT NULL,
          system_prompt_hash TEXT,
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'active'
        );
        CREATE INDEX IF NOT EXISTS idx_agent_registry_role
          ON agent_registry(role, status);

        CREATE TABLE IF NOT EXISTS agent_missions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          role TEXT NOT NULL,
          objectives TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          output TEXT,
          cost_tokens INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open'
        );
        CREATE INDEX IF NOT EXISTS idx_agent_missions_agent
          ON agent_missions(agent_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_missions_status
          ON agent_missions(status, started_at DESC);

        CREATE TABLE IF NOT EXISTS agent_scores (
          id TEXT PRIMARY KEY,
          mission_id TEXT NOT NULL,
          criterion TEXT NOT NULL,
          score_0_10 REAL NOT NULL,
          judge_id TEXT,
          notes TEXT,
          scored_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_scores_mission
          ON agent_scores(mission_id);

        CREATE TABLE IF NOT EXISTS agent_perf_daily (
          agent_id TEXT NOT NULL,
          date TEXT NOT NULL,
          missions_count INTEGER DEFAULT 0,
          missions_failed INTEGER DEFAULT 0,
          avg_score REAL,
          total_cost_usd REAL DEFAULT 0,
          PRIMARY KEY (agent_id, date)
        );

        CREATE TABLE IF NOT EXISTS patch_queue (
          id TEXT PRIMARY KEY,
          proposed_by_agent TEXT NOT NULL,
          source_bug_pattern TEXT,
          target_file TEXT,
          patch_type TEXT,
          diff TEXT NOT NULL,
          explanation TEXT NOT NULL,
          expected_improvement TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          proposed_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewed_by TEXT,
          review_notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_patch_queue_status
          ON patch_queue(status, proposed_at DESC);

        CREATE TABLE IF NOT EXISTS ai_ops_bugs (
          id TEXT PRIMARY KEY,
          mission_id TEXT NOT NULL,
          bug_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          evidence TEXT,
          suggested_fix_category TEXT,
          detected_at INTEGER NOT NULL,
          resolved_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_ai_ops_bugs_severity
          ON ai_ops_bugs(severity, detected_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_ops_bugs_type
          ON ai_ops_bugs(bug_type, detected_at DESC);
      `);
    } catch (e) {
      console.warn('[db] ai_ops migration skipped:', e);
    }

    // Talk2Me #408 — Watch Together consentement (Pascal 2026-06-05).
    // Doctrine [[talk2me-watch-together-passthrough]] : pas de partage forcé.
    // L'inviteur lance avec invite_status='pending' ; le destinataire doit
    // explicitement accepter (POST /accept) ou refuser (POST /decline).
    // 'pending' → 'accepted' | 'declined' | 'ended'.
    try {
      db.exec("ALTER TABLE activities ADD COLUMN invite_status TEXT DEFAULT 'accepted'");
    } catch { /* déjà */ }
    // Rétro-fill : toutes les activités legacy sont considérées acceptées
    // (sinon elles seraient en pending indéfiniment).
    try {
      db.exec(
        "UPDATE activities SET invite_status = 'accepted' WHERE invite_status IS NULL OR invite_status = ''"
      );
    } catch { /* ignore */ }

    // Talk2Me #408 — Tables jeux interactifs (chess + dames) Pascal 2026-06-05.
    // Doctrine [[talktome-produit-abouti]] : pas un MVP, tout doit marcher.
    // activity_id : lien optionnel vers une activité kind='chess'|'dame'
    // (auto-end si l'activité se ferme). Permet aussi partie solo vs Léa
    // depuis la conv agent sans activity (activity_id NULL).
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chess_games (
          id TEXT PRIMARY KEY,
          conv_id TEXT NOT NULL,
          activity_id TEXT,
          player_white TEXT NOT NULL,
          player_black TEXT NOT NULL,
          fen TEXT NOT NULL,
          moves TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'in_progress',
          winner TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_chess_games_conv ON chess_games(conv_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chess_games_status ON chess_games(status, started_at DESC);

        CREATE TABLE IF NOT EXISTS dame_games (
          id TEXT PRIMARY KEY,
          conv_id TEXT NOT NULL,
          activity_id TEXT,
          player_white TEXT NOT NULL,
          player_black TEXT NOT NULL,
          state TEXT NOT NULL,
          moves TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'in_progress',
          winner TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_dame_games_conv ON dame_games(conv_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_dame_games_status ON dame_games(status, started_at DESC);
      `);
    } catch (e) {
      console.warn('[db] games migration skipped:', e);
    }

    // Talk2Me #416 — Pascal 2026-06-05. Extension games :
    //  - arbiter : 'lea' si une IA arbitre (2 humains qui jouent), NULL sinon
    //  - paused_at : timestamp pause manuelle (reprise possible plus tard)
    // Pascal verbatim : "Léa N'A PAS LE DROIT DE JOUER, elle enregistre juste
    // le jeu" + "Comme ça on a pas fini, on reprend là où on s'est arrêté".
    // Doctrine [[talktome-produit-abouti]] : ALTER idempotent, try/catch.
    try {
      db.exec("ALTER TABLE chess_games ADD COLUMN arbiter TEXT");
    } catch { /* déjà */ }
    try {
      db.exec("ALTER TABLE chess_games ADD COLUMN paused_at INTEGER");
    } catch { /* déjà */ }
    try {
      db.exec("ALTER TABLE dame_games ADD COLUMN arbiter TEXT");
    } catch { /* déjà */ }
    try {
      db.exec("ALTER TABLE dame_games ADD COLUMN paused_at INTEGER");
    } catch { /* déjà */ }

    // Talk2Me #409 — Feature Registry & Regression Test Suite (Pascal 2026-06-05).
    // Doctrine [[feedback-modular-no-scattered-patches]] + [[feedback-watchdog-pipeline]] :
    // chaque feature UX déclarée + check E2E auto + alerte Telegram si régression.
    // Pascal verbatim : "je n'accepte pas la régression : quand j'ajoute une
    // fonctionnalité, y en a qui fonctionne plus au bout de plusieurs modifications".
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS feature_registry (
          id TEXT PRIMARY KEY,
          module TEXT NOT NULL,
          feature_name TEXT NOT NULL,
          description TEXT,
          added_at INTEGER NOT NULL,
          added_in_task TEXT,
          test_path TEXT,
          last_pass_at INTEGER,
          last_fail_at INTEGER,
          last_fail_reason TEXT,
          consecutive_fails INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'live'
        );
        CREATE INDEX IF NOT EXISTS idx_fr_module ON feature_registry(module);
        CREATE INDEX IF NOT EXISTS idx_fr_status ON feature_registry(status);

        CREATE TABLE IF NOT EXISTS feature_test_runs (
          id TEXT PRIMARY KEY,
          run_at INTEGER NOT NULL,
          ended_at INTEGER,
          total INTEGER,
          passed INTEGER,
          failed INTEGER,
          flaky INTEGER,
          duration_ms INTEGER,
          report_path TEXT,
          trigger TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ftruns_run_at ON feature_test_runs(run_at DESC);

        CREATE TABLE IF NOT EXISTS feature_test_results (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          feature_id TEXT NOT NULL,
          passed INTEGER NOT NULL,
          duration_ms INTEGER,
          error_message TEXT,
          evidence TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ftr_run ON feature_test_results(run_id);
        CREATE INDEX IF NOT EXISTS idx_ftr_feature ON feature_test_results(feature_id);
      `);
    } catch (e) {
      console.warn('[db] feature_registry migration skipped:', e);
    }

    // Talk2Me #418 — Calls v2 tonalité honnête (Pascal 2026-06-05).
    // Module appels avec heartbeat ring_beat envoyé par l'appelé : la tonalité
    // côté appelant n'est jouée que si la beat arrive réellement. Fin du fake
    // ringing style WhatsApp. Doctrine [[talk2me-calls-architecture]] +
    // [[modular-no-scattered-patches]] (tout vit dans lib/calls/ + API isolée).
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          caller_id TEXT NOT NULL,
          callee_id TEXT NOT NULL,
          conv_id TEXT,
          kind TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'ringing',
          started_at INTEGER NOT NULL,
          accepted_at INTEGER,
          ended_at INTEGER,
          end_reason TEXT,
          last_ring_beat_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_calls_callee_active ON calls(callee_id, state);
        CREATE INDEX IF NOT EXISTS idx_calls_caller_active ON calls(caller_id, state);
        CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at DESC);
      `);
    } catch (e) {
      console.warn('[db] calls v2 migration skipped:', e);
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

// ============ users ============
// /lib/db/users.ts — User table CRUD (auth, profile, AI settings).
//
// Inclut createUser (avec setup T2M Officiel par défaut), getUserBy*,
// updateAi*/updateUserAvatar, slug helpers, generateTalk2MeId.
// Le createUser doit aussi initialiser la conversation 'agent' du user, on
// ré-importe getOrCreateUserConversation de conversations.ts (pas de cycle :
// conversations.ts n'importe pas users.ts).


// ===================== Types =====================

export type AiGender = 'feminin' | 'masculin' | 'neutre';

export const AI_GENDER_VALUES: AiGender[] = ['feminin', 'masculin', 'neutre'];

export function normalizeAiGender(value: unknown): AiGender {
  if (value === 'feminin' || value === 'masculin' || value === 'neutre') {
    return value;
  }
  return 'neutre';
}

export interface DbUser {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  ai_name: string | null;
  ai_avatar_url: string | null;
  ai_gender: AiGender;
  created_at: number;
  last_seen: number | null;
}

export interface CreateUserInput {
  email: string;
  displayName?: string | null;
  username?: string | null;
}

// ===================== Row parser =====================

export function parseUserRow(row: any): DbUser {
  // Talk2Me #324 v2 — Si ai_name absent (legacy / signup pre-migration),
  // fallback = "T2M de <display_name>" (ou username). JAMAIS "Léa".
  const displayName =
    typeof row.display_name === 'string' && row.display_name.trim() !== ''
      ? row.display_name.trim()
      : row.username;
  const defaultAiName = `T2M de ${displayName}`;
  return {
    id: row.id,
    talk2me_id: row.talk2me_id,
    username: row.username,
    display_name: row.display_name ?? null,
    email: typeof row.email === 'string' ? row.email : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    ai_name:
      typeof row.ai_name === 'string' && row.ai_name.trim() !== ''
        ? row.ai_name
        : defaultAiName,
    ai_avatar_url:
      typeof row.ai_avatar_url === 'string' ? row.ai_avatar_url : null,
    ai_gender: normalizeAiGender(row.ai_gender),
    created_at: row.created_at,
    last_seen: typeof row.last_seen === 'number' ? row.last_seen : null,
  };
}

// ===================== AI profile mutations =====================

/**
 * Talk2Me #325 — Met à jour le genre de l'IA personnelle d'un user.
 * Valeur strictement whitelistée : 'feminin' | 'masculin' | 'neutre'.
 * Throw sur valeur invalide.
 */
export function updateAiGender(userId: string, gender: unknown): boolean {
  if (!userId) return false;
  if (gender !== 'feminin' && gender !== 'masculin' && gender !== 'neutre') {
    throw new Error('ai_gender_invalid');
  }
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_gender = ? WHERE id = ?')
    .run(gender, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #324 — Met à jour le nom de l'IA personnelle d'un user.
 * Accepte 1-40 chars, lettres/chiffres/accents/espaces/_-, sinon throw.
 * Le pattern par défaut "T2M de Pascal" passe (espaces autorisés).
 */
export function updateAiName(userId: string, aiName: string): boolean {
  if (!userId) return false;
  const clean = (aiName || '').trim();
  if (!clean) throw new Error('ai_name_required');
  if (clean.length > 40) throw new Error('ai_name_too_long');
  if (!/^[\p{L}\p{N} _-]{1,40}$/u.test(clean)) {
    throw new Error('ai_name_invalid');
  }
  const db = getDb();
  const r = db.prepare('UPDATE users SET ai_name = ? WHERE id = ?').run(clean, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #324 — Met à jour l'avatar URL de l'IA personnelle d'un user.
 * Passer null pour retirer.
 */
export function updateAiAvatar(userId: string, avatarUrl: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_avatar_url = ? WHERE id = ?')
    .run(avatarUrl, userId);
  return r.changes > 0;
}

/**
 * Met à jour l'avatar_url d'un user (chemin public sous /uploads/avatars/...).
 * Passer null pour retirer l'avatar.
 */
export function updateUserAvatar(userId: string, avatarUrl: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  return r.changes > 0;
}

// ===================== Lookups =====================

/**
 * Génère un Talk2Me ID unique 6 chiffres (100000–999999).
 * Retry jusqu'à 50 fois en cas de collision (improbable au début).
 */
export function generateTalk2MeId(): string {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ? LIMIT 1');
  for (let i = 0; i < 50; i++) {
    const n = 100000 + Math.floor(Math.random() * 900000);
    const candidate = String(n);
    const exists = stmt.get(candidate);
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique Talk2Me ID after 50 attempts');
}

export function getUserByUsername(username: string): DbUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  return row ? parseUserRow(row) : null;
}

export function getUserById(id: string): DbUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  return row ? parseUserRow(row) : null;
}

export function getUserByEmail(email: string): DbUser | null {
  if (!email) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim()) as any;
  return row ? parseUserRow(row) : null;
}

/** Récupère un user par Talk2Me ID 6 chiffres exact. */
export function getUserByTalk2MeId(talk2meId: string): DbUser | null {
  if (!talk2meId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE talk2me_id = ?').get(talk2meId.trim()) as any;
  return row ? parseUserRow(row) : null;
}

/**
 * Recherche d'users : par username partiel (LIKE) OU par Talk2Me ID exact
 * (si query = 6 chiffres). Exclut l'user courant. Limite 20 résultats.
 */
export function searchUsers(query: string, excludeUserId?: string | null): DbUser[] {
  const q = (query || '').trim();
  if (!q) return [];
  const db = getDb();
  const cleanQ = q.replace(/^@/, '').toLowerCase();

  // Talk2Me ID exact (6 chiffres) → match prioritaire
  if (/^\d{6}$/.test(cleanQ)) {
    const exact = getUserByTalk2MeId(cleanQ);
    if (exact && exact.id !== excludeUserId) return [exact];
    return [];
  }

  // Sinon : recherche LIKE sur username + display_name
  const like = `%${cleanQ}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users
       WHERE (LOWER(username) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ?)
         AND id != ?
       ORDER BY
         CASE WHEN LOWER(username) = ? THEN 0
              WHEN LOWER(username) LIKE ? THEN 1
              ELSE 2 END,
         username ASC
       LIMIT 20`
    )
    .all(like, like, excludeUserId || '', cleanQ, `${cleanQ}%`) as any[];
  return rows.map(parseUserRow);
}

// ===================== Username slug helpers =====================

/**
 * Extrait un slug username depuis l'email : partie locale (avant @),
 * minuscules, [a-z0-9_] seulement, tronqué à 17 chars (laisse 3 chars
 * de marge pour un suffixe collision). Padding "user" si trop court.
 */
export function slugFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').toLowerCase();
  const cleaned = local.replace(/[^a-z0-9_]/g, '');
  const base = cleaned.length >= 3 ? cleaned : 'user' + cleaned;
  return base.slice(0, 17);
}

/**
 * Garantit un username disponible : essaie `base`, puis `base_xyz` avec xyz
 * = 3 chars hex random. 50 tentatives max.
 */
export function generateUniqueUsername(base: string): string {
  if (!getUserByUsername(base)) return base;
  for (let i = 0; i < 50; i++) {
    const suffix = randomBytes(2).toString('hex').slice(0, 3);
    const candidate = `${base}_${suffix}`.slice(0, 20);
    if (!getUserByUsername(candidate)) return candidate;
  }
  throw new Error('Could not generate unique username after 50 attempts');
}

// ===================== createUser =====================
//
// Lazy import getOrCreateUserConversation depuis conversations.ts pour
// éviter le cycle d'import statique (conversations.ts dépend de _core et
// pas de users.ts en static, mais on garde la prudence).

/**
 * Crée un compte PASSWORDLESS (auth = magic link email).
 * - email : obligatoire, format basique validé, unique
 * - displayName : optionnel ; défaut = partie locale de l'email capitalisée
 * - username : optionnel ; défaut = slugFromEmail + dédoublonnage auto
 * Le Talk2Me ID 6 chiffres reste généré automatiquement.
 */
export function createUser(input: CreateUserInput): DbUser {
  const db = getDb();
  const cleanEmail = typeof input.email === 'string' ? input.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('invalid_email');
  }
  if (getUserByEmail(cleanEmail)) {
    throw new Error('email_taken');
  }

  let finalUsername: string;
  if (typeof input.username === 'string' && input.username.trim() !== '') {
    const cleanUsername = input.username.replace(/^@/, '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      throw new Error('invalid_username');
    }
    if (getUserByUsername(cleanUsername)) {
      throw new Error('username_taken');
    }
    finalUsername = cleanUsername;
  } else {
    finalUsername = generateUniqueUsername(slugFromEmail(cleanEmail));
  }

  const rawLocal = (cleanEmail.split('@')[0] || finalUsername).trim();
  const autoDisplay = rawLocal
    ? rawLocal.charAt(0).toUpperCase() + rawLocal.slice(1)
    : finalUsername;
  const cleanDisplay =
    typeof input.displayName === 'string' && input.displayName.trim() !== ''
      ? input.displayName.trim()
      : autoDisplay;

  const id = randomUUID();
  const talk2meId = generateTalk2MeId();
  const now = Date.now();
  // Talk2Me #324 v2 — ai_name par défaut "T2M de <display_name>" (Pascal 2026-06-04)
  const defaultAiName = `T2M de ${cleanDisplay}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(id, talk2meId, finalUsername, cleanDisplay, cleanEmail, now, now, defaultAiName);

  // Crée d'office la conversation 1-to-1 de l'user avec Talk2Me.
  // Tout est dans ce fichier monolithique, plus de require dynamique.
  getOrCreateUserConversation(id);

  // Talk2Me #388 (Pascal 2026-06-05) — Ajoute T2M Officiel comme ami par défaut.
  // T2M Officiel est le compte système (community manager) accessible à tous.
  // L'env var permet d'override l'ID; fallback sur l'UUID seedé en #378.
  const T2M_OFFICIEL_ID =
    process.env.T2M_OFFICIEL_USER_ID || '8f508701-fbdb-460f-bd95-e826873f79e1';
  try {
    if (T2M_OFFICIEL_ID && T2M_OFFICIEL_ID !== id) {
      const officielExists = db
        .prepare('SELECT 1 FROM users WHERE id = ?')
        .get(T2M_OFFICIEL_ID);
      if (officielExists) {
        // Friendship
        const [userA, userB] =
          id < T2M_OFFICIEL_ID ? [id, T2M_OFFICIEL_ID] : [T2M_OFFICIEL_ID, id];
        db.prepare(
          `INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at)
           VALUES (?, ?, ?, 'accepted', ?)`,
        ).run(randomUUID(), userA, userB, now);

        // Conversation P2P (pour que T2M Officiel apparaisse dans /friends)
        const p2pConvId = randomUUID();
        db.prepare(
          `INSERT INTO conversations (id, kind, created_at) VALUES (?, 'p2p', ?)`,
        ).run(p2pConvId, now);
        db.prepare(
          `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`,
        ).run(p2pConvId, id, now);
        db.prepare(
          `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`,
        ).run(p2pConvId, T2M_OFFICIEL_ID, now);
      }
    }
  } catch (e) {
    // Silent — ne pas bloquer la création d'user si la friendship/conv échoue
    console.warn('[createUser] T2M Officiel default setup failed:', e);
  }

  return {
    id,
    talk2me_id: talk2meId,
    username: finalUsername,
    display_name: cleanDisplay,
    email: cleanEmail,
    avatar_url: null,
    ai_name: defaultAiName,
    ai_avatar_url: null,
    ai_gender: 'neutre',
    created_at: now,
    last_seen: now,
  };
}

// ============ sessions ============
// /lib/db/sessions.ts — Magic links (passwordless) + sessions.


export interface DbSession {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface DbMagicLink {
  token: string;
  email: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

export interface MagicLinkConsumed {
  email: string;
  user_id: string | null;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ===================== Magic Links =====================

/**
 * Crée un magic link pour `email`. Si `userId` est fourni (user existant),
 * on associe le token au user direct (signin) ; sinon, le user sera créé
 * à la vérification (signup unifié).
 * Token = 32 bytes random → base64url (~43 chars), validité 15 min.
 */
export function createMagicLink(
  email: string,
  userId?: string | null,
): { token: string; expires_at: number } {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) throw new Error('email_required');
  const db = getDb();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + MAGIC_LINK_TTL_MS;
  db.prepare(
    'INSERT INTO magic_links (token, email, user_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)'
  ).run(token, cleanEmail, userId ?? null, now, expires);
  return { token, expires_at: expires };
}

/**
 * Consomme un magic link. Retourne {email, user_id?} si valide (non utilisé,
 * non expiré), null sinon. Marque used_at pour empêcher réutilisation.
 * Atomique via transaction (lecture + update).
 */
export function consumeMagicLink(token: string): MagicLinkConsumed | null {
  if (!token) return null;
  const db = getDb();
  const tx = db.transaction((tok: string): MagicLinkConsumed | null => {
    const row = db
      .prepare('SELECT * FROM magic_links WHERE token = ?')
      .get(tok) as any;
    if (!row) return null;
    if (row.used_at !== null && row.used_at !== undefined) return null;
    if (typeof row.expires_at !== 'number' || row.expires_at <= Date.now()) {
      return null;
    }
    db.prepare('UPDATE magic_links SET used_at = ? WHERE token = ?').run(
      Date.now(),
      tok,
    );
    return {
      email: row.email,
      user_id: typeof row.user_id === 'string' ? row.user_id : null,
    };
  });
  return tx(token);
}

/**
 * Purge les magic links expirés ou utilisés depuis plus de 24h (housekeeping).
 */
export function purgeExpiredMagicLinks(): number {
  const db = getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const r = db
    .prepare('DELETE FROM magic_links WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)')
    .run(Date.now(), cutoff);
  return r.changes;
}

// ===================== Sessions =====================

export function createSession(userId: string): DbSession {
  const db = getDb();
  const token = randomUUID();
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, expires);
  return { token, user_id: userId, created_at: now, expires_at: expires };
}

export function getSessionUser(token: string): DbUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as any;
  if (!row) return null;
  // Touch last_seen (optionnel)
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), row.id);
  return parseUserRow(row);
}

export function deleteSession(token: string): void {
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function purgeExpiredSessions(): number {
  const db = getDb();
  const r = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  return r.changes;
}

// ============ conversations ============
// /lib/db/conversations.ts — Conversations CRUD (agent + P2P + activities).
//
// Inclut : getOrCreateUserConversation (agent), createP2PConversation,
// getConversation, listUserConversations, updateConversationPreview,
// markConversationRead, presence helpers, activities helpers.
//
// Note : getOrCreateUserConversation est appelé par users.createUser via un
// require dynamique pour éviter un cycle d'import.



// ===================== Types =====================

export interface DbConversation {
  id: string;
  user_id: string;
  created_at: number;
}

export type ConversationKind = 'agent' | 'p2p' | 'group';

export interface DbConversationFull {
  id: string;
  kind: ConversationKind;
  created_by: string | null;
  created_at: number;
  last_message_preview: string | null;
  last_message_at: number | null;
  participants: DbUser[];
}

export interface ConversationListItem extends DbConversationFull {
  /** "L'autre" pour une conv p2p, l'agent Talk2Me pour kind=agent (null côté DB). */
  peer: DbUser | null;
  unread_count: number;
}

export interface DbPresence {
  user_id: string;
  last_seen: number;
  status: 'online' | 'away' | 'offline';
}

export interface DbActivityRow {
  id: string;
  conv_id: string;
  kind: ActivityKind;
  state: string;            // JSON sérialisé
  started_by: string;
  started_at: number;
  ended_at: number | null;
}

// ===================== USER CONVERSATIONS (agent) =====================

/**
 * Retourne (ou crée) LA conversation 1-to-1 de l'user avec Talk2Me (kind='agent').
 * - Phase 3 : inscrit aussi le user dans conversation_participants.
 * - Rétro-compat : sélectionne la conv kind='agent' OU sans kind (NULL legacy).
 */
export function getOrCreateUserConversation(userId: string): DbConversation {
  if (!userId) throw new Error('userId required');
  const db = getDb();

  const existing = db
    .prepare(
      `SELECT * FROM conversations
         WHERE user_id = ? AND (kind IS NULL OR kind = 'agent')
         ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId) as any;

  if (existing) {
    // Phase 3 : garantir présence dans conversation_participants
    db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run(existing.id, userId, existing.created_at || Date.now());
    return {
      id: existing.id,
      user_id: existing.user_id,
      created_at: existing.created_at,
    };
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
  ).run(id, userId, now, userId);
  db.prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(id, userId, now);

  return { id, user_id: userId, created_at: now };
}

/** Alias plus parlant : utilisable côté pages Messages. */
export const getOrCreateAgentConversation = getOrCreateUserConversation;

/**
 * Reset la conversation 1-to-1 d'un user : supprime tous ses messages et la conversation.
 * Les posts publiés référençant des message_ids deviennent orphelins (accepté MVP).
 */
export function resetUserConversation(userId: string): number {
  if (!userId) return 0;
  const db = getDb();
  const conv = db
    .prepare(
      'SELECT id FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(userId) as { id?: string } | undefined;
  if (!conv?.id) return 0;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM posts WHERE conversation_id = ?').run(conv.id);
    const r = db
      .prepare('DELETE FROM messages WHERE conversation_id = ?')
      .run(conv.id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
    return r.changes;
  });
  return tx();
}

// ===================== CONVERSATIONS MULTI-PARTICIPANTS (P2P) =====================

function getConversationRow(convId: string): any | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as any) ||
    null
  );
}

function loadParticipants(convId: string): DbUser[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.* FROM conversation_participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.conversation_id = ?
         ORDER BY p.joined_at ASC`
    )
    .all(convId) as any[];
  return rows.map(parseUserRow);
}

/**
 * Crée (ou retourne) une conversation 1-to-1 entre 2 users (kind='p2p').
 * Idempotent : si une conv p2p existe déjà avec exactement ces 2 participants,
 * on la renvoie. Sinon création + 2 participants.
 */
export function createP2PConversation(userIdA: string, userIdB: string): DbConversationFull {
  if (!userIdA || !userIdB) throw new Error('user ids required');
  if (userIdA === userIdB) throw new Error('cannot_p2p_self');
  const db = getDb();
  if (!getUserById(userIdA) || !getUserById(userIdB)) {
    throw new Error('user_not_found');
  }
  // Cherche une conv p2p existante contenant exactement ces 2 participants.
  const existing = db
    .prepare(
      `SELECT c.id FROM conversations c
         WHERE c.kind = 'p2p'
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND (SELECT COUNT(*) FROM conversation_participants p
                WHERE p.conversation_id = c.id) = 2
         LIMIT 1`
    )
    .get(userIdA, userIdB) as { id?: string } | undefined;
  if (existing?.id) {
    return getConversation(existing.id, userIdA)!;
  }
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'p2p', ?)"
    ).run(id, userIdA, now, userIdA);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    ins.run(id, userIdA, now);
    ins.run(id, userIdB, now);
  });
  tx();
  return {
    id,
    kind: 'p2p',
    created_by: userIdA,
    created_at: now,
    last_message_preview: null,
    last_message_at: null,
    participants: loadParticipants(id),
  };
}

/**
 * Retourne une conversation si le user est participant, sinon null.
 */
export function getConversation(convId: string, userId: string): DbConversationFull | null {
  if (!convId || !userId) return null;
  const db = getDb();
  const row = getConversationRow(convId);
  if (!row) return null;
  const isParticipant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1'
    )
    .get(convId, userId);
  if (!isParticipant) return null;
  return {
    id: row.id,
    kind: (row.kind as ConversationKind) || 'agent',
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    last_message_preview: row.last_message_preview ?? null,
    last_message_at: row.last_message_at ?? null,
    participants: loadParticipants(convId),
  };
}

/**
 * Liste les conversations du user, triées DESC last_message_at (NULL en
 * dernier). Pour chaque conv, retourne participants, peer (= l'autre dans p2p,
 * null pour agent ou self-only), unread_count (basé sur last_read_at).
 */
export function listUserConversations(userId: string): ConversationListItem[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, p.last_read_at AS my_last_read
         FROM conversation_participants p
         JOIN conversations c ON c.id = p.conversation_id
         WHERE p.user_id = ?
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(userId) as any[];

  const out: ConversationListItem[] = [];
  for (const row of rows) {
    const participants = loadParticipants(row.id);
    const peer =
      (row.kind as ConversationKind) === 'p2p'
        ? participants.find((p) => p.id !== userId) || null
        : null;
    const lastRead = typeof row.my_last_read === 'number' ? row.my_last_read : 0;
    const unreadRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
           WHERE conversation_id = ? AND created_at > ?
             AND role = 'user'`
      )
      .get(row.id, lastRead) as { c?: number } | undefined;
    out.push({
      id: row.id,
      kind: (row.kind as ConversationKind) || 'agent',
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      last_message_preview: row.last_message_preview ?? null,
      last_message_at: row.last_message_at ?? null,
      participants,
      peer,
      unread_count: unreadRow?.c ?? 0,
    });
  }
  return out;
}

/** Met à jour preview + timestamp d'une conversation (utilisé en P2P broadcast). */
export function updateConversationPreview(
  convId: string,
  text: string,
  ts: number
): void {
  if (!convId) return;
  const db = getDb();
  const preview = (text || '').trim().slice(0, 140);
  db.prepare(
    'UPDATE conversations SET last_message_preview = ?, last_message_at = ? WHERE id = ?'
  ).run(preview, ts, convId);
}

/** Marque la conversation comme lue par le user (pour unread_count). */
export function markConversationRead(convId: string, userId: string): void {
  if (!convId || !userId) return;
  const db = getDb();
  db.prepare(
    'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
  ).run(Date.now(), convId, userId);
}

// ===================== PRÉSENCE =====================

export function updatePresence(
  userId: string,
  status: DbPresence['status'] = 'online'
): DbPresence {
  if (!userId) throw new Error('userId required');
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO presence (user_id, last_seen, status) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen, status = excluded.status`
  ).run(userId, now, status);
  return { user_id: userId, last_seen: now, status };
}

export function getPresence(userId: string): DbPresence | null {
  if (!userId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM presence WHERE user_id = ?').get(userId) as any;
  if (!row) return null;
  return {
    user_id: row.user_id,
    last_seen: row.last_seen,
    status: (row.status as DbPresence['status']) || 'online',
  };
}

const PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min

/** Liste les amis online (last_seen < 5min). */
export function getOnlineFriends(
  userId: string
): Array<DbUser & { presence: DbPresence }> {
  if (!userId) return [];
  const db = getDb();
  const cutoff = Date.now() - PRESENCE_ONLINE_WINDOW_MS;
  const rows = db
    .prepare(
      `SELECT u.*, pr.last_seen AS p_last_seen, pr.status AS p_status
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         JOIN presence pr ON pr.user_id = u.id
         WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
           AND pr.last_seen >= ?
         ORDER BY pr.last_seen DESC`
    )
    .all(userId, userId, userId, cutoff) as any[];
  return rows.map((r) => ({
    ...parseUserRow(r),
    presence: {
      user_id: r.id,
      last_seen: r.p_last_seen,
      status: (r.p_status as DbPresence['status']) || 'online',
    },
  }));
}

/** Retourne la map des presences pour une liste d'user ids. */
export function getPresences(userIds: string[]): Record<string, DbPresence> {
  if (!userIds.length) return {};
  const db = getDb();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM presence WHERE user_id IN (${placeholders})`)
    .all(...userIds) as any[];
  const out: Record<string, DbPresence> = {};
  for (const r of rows) {
    out[r.user_id] = {
      user_id: r.user_id,
      last_seen: r.last_seen,
      status: (r.status as DbPresence['status']) || 'online',
    };
  }
  return out;
}

// ===================== ACTIVITÉS SYNCHRONISÉES =====================

function parseActivityRow(row: any): Activity<unknown> {
  let state: unknown = null;
  try {
    state = row.state ? JSON.parse(row.state) : null;
  } catch {
    state = null;
  }
  // Talk2Me #408 — invite_status propagé (rétro-compat : 'accepted' si NULL).
  const inviteStatus =
    row.invite_status === 'pending' ||
    row.invite_status === 'declined' ||
    row.invite_status === 'ended' ||
    row.invite_status === 'accepted'
      ? (row.invite_status as 'pending' | 'accepted' | 'declined' | 'ended')
      : 'accepted';
  return {
    id: row.id,
    conv_id: row.conv_id,
    kind: row.kind as ActivityKind,
    state,
    started_by: row.started_by,
    started_at: row.started_at,
    invite_status: inviteStatus,
  };
}

/**
 * Démarre une activité dans une conversation. La logique d'auth/membership est
 * vérifiée côté API (route handler). On termine automatiquement les éventuelles
 * activités encore ouvertes (ended_at IS NULL) pour cette conv afin qu'il n'y
 * en ait qu'une active à la fois (MVP).
 *
 * Talk2Me #408 — invite_status par défaut 'pending' pour Watch Together
 * (consentement explicite). Le caller peut forcer 'accepted' (cas solo / jeux
 * solo vs Léa où le destinataire est l'IA, pas besoin d'opt-in).
 */
export function startActivity(
  convId: string,
  kind: ActivityKind,
  state: unknown,
  startedBy: string,
  inviteStatus: 'pending' | 'accepted' = 'pending'
): Activity<unknown> {
  if (!convId) throw new Error('convId required');
  if (!startedBy) throw new Error('startedBy required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    // Ferme toute activité encore ouverte pour cette conv
    db.prepare(
      'UPDATE activities SET ended_at = ? WHERE conv_id = ? AND ended_at IS NULL'
    ).run(now, convId);
    db.prepare(
      'INSERT INTO activities (id, conv_id, kind, state, started_by, started_at, ended_at, invite_status) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).run(id, convId, kind, JSON.stringify(state ?? null), startedBy, now, inviteStatus);
  });
  tx();
  return {
    id,
    conv_id: convId,
    kind,
    state,
    started_by: startedBy,
    started_at: now,
    invite_status: inviteStatus,
  };
}

/**
 * Talk2Me #408 — Update invite_status d'une activité (Pascal 2026-06-05).
 * Retourne l'activité MAJ ou null si introuvable / déjà ended.
 */
export function setActivityInviteStatus(
  activityId: string,
  status: 'pending' | 'accepted' | 'declined' | 'ended'
): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET invite_status = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(status, activityId);
  if (r.changes === 0) return null;
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId) as any;
  return row ? parseActivityRow(row) : null;
}

/**
 * Met à jour le state d'une activité (typiquement après play/pause/seek du
 * leader pour une VideoSyncState). Renvoie l'activité mise à jour ou null si
 * inexistante / déjà terminée.
 */
export function updateActivityState(
  activityId: string,
  state: unknown
): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET state = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(JSON.stringify(state ?? null), activityId);
  if (r.changes === 0) return null;
  const row = db
    .prepare('SELECT * FROM activities WHERE id = ?')
    .get(activityId) as any;
  return row ? parseActivityRow(row) : null;
}

/** Termine une activité (ended_at = now). Idempotent. */
export function endActivity(activityId: string): boolean {
  if (!activityId) return false;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET ended_at = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(Date.now(), activityId);
  return r.changes > 0;
}

/**
 * Récupère l'activité active d'une conversation (ended_at IS NULL). MVP : une
 * seule activité active à la fois par conv. Retourne null sinon.
 */
export function getActiveActivity(convId: string): Activity<unknown> | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      'SELECT * FROM activities WHERE conv_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(convId) as any;
  return row ? parseActivityRow(row) : null;
}

/** Récupère une activité par id (active ou terminée). */
export function getActivityById(activityId: string): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM activities WHERE id = ?')
    .get(activityId) as any;
  return row ? parseActivityRow(row) : null;
}

/**
 * Vérifie qu'un user est participant de la conversation à laquelle appartient
 * une activité. Helper pour autoriser update/end depuis les routes.
 */
export function userCanAccessActivity(
  activityId: string,
  userId: string
): { activity: Activity<unknown>; convId: string } | null {
  if (!activityId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.* FROM activities a
         JOIN conversation_participants p
           ON p.conversation_id = a.conv_id
         WHERE a.id = ? AND p.user_id = ?
         LIMIT 1`
    )
    .get(activityId, userId) as any;
  if (!row) return null;
  return { activity: parseActivityRow(row), convId: row.conv_id };
}

// ===================== Talk2Me #408 — JEUX (chess + dames) =====================
// Doctrine [[talktome-produit-abouti]] : pas un MVP, plateaux complets.
//
// Les helpers ci-dessous sont volontairement plats (pas de validation moves) :
// la validation chess est faite via chess.js dans /api/chess/[id]/move ; la
// validation dame via lib/games/dame-engine.ts. La DB n'est qu'un store.

import type {
  ChessGame,
  DameGame,
  DameGameState,
  DameMove,
  GameStatus,
} from '@/lib/games/types';

// ----- CHESS -----

function parseChessRow(row: any): ChessGame {
  let moves: string[] = [];
  try {
    const p = row.moves ? JSON.parse(row.moves) : [];
    if (Array.isArray(p)) moves = p.filter((m): m is string => typeof m === 'string');
  } catch { /* ignore */ }
  return {
    id: row.id,
    conv_id: row.conv_id,
    activity_id: row.activity_id ?? null,
    player_white: row.player_white,
    player_black: row.player_black,
    fen: row.fen,
    moves,
    status: (row.status as GameStatus) || 'in_progress',
    winner: row.winner ?? null,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    // Talk2Me #416 (Pascal 2026-06-05) — mode arbitre + pause.
    arbiter: typeof row.arbiter === 'string' && row.arbiter ? row.arbiter : null,
    paused_at: typeof row.paused_at === 'number' ? row.paused_at : null,
  };
}

export function createChessGame(args: {
  convId: string;
  activityId: string | null;
  playerWhite: string;
  playerBlack: string;
  startFen: string;
  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Si 'lea', Léa arbitre. Sinon NULL.
   * Quand arbiter='lea', NE PAS mettre 'lea' dans player_white/player_black :
   * elle observe, ne joue pas. Pascal verbatim : "Léa N'A PAS LE DROIT DE
   * JOUER, elle enregistre juste le jeu".
   */
  arbiter?: string | null;
}): ChessGame {
  if (!args.convId) throw new Error('convId required');
  if (!args.playerWhite || !args.playerBlack) throw new Error('players required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO chess_games
       (id, conv_id, activity_id, player_white, player_black, fen, moves, status, winner, started_at, ended_at, arbiter, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'in_progress', NULL, ?, NULL, ?, NULL)`
  ).run(
    id, args.convId, args.activityId, args.playerWhite, args.playerBlack, args.startFen, now,
    args.arbiter || null
  );
  const row = db.prepare('SELECT * FROM chess_games WHERE id = ?').get(id) as any;
  return parseChessRow(row);
}

export function getChessGame(gameId: string): ChessGame | null {
  if (!gameId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM chess_games WHERE id = ?').get(gameId) as any;
  return row ? parseChessRow(row) : null;
}

export function getActiveChessGameForConv(convId: string): ChessGame | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM chess_games WHERE conv_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    )
    .get(convId) as any;
  return row ? parseChessRow(row) : null;
}

export function applyChessMove(args: {
  gameId: string;
  fen: string;
  moves: string[];
  status: GameStatus;
  winner: string | null;
}): ChessGame | null {
  const db = getDb();
  const now = Date.now();
  const endedAt = args.status === 'in_progress' ? null : now;
  const r = db
    .prepare(
      `UPDATE chess_games
         SET fen = ?, moves = ?, status = ?, winner = ?, ended_at = COALESCE(?, ended_at)
         WHERE id = ?`
    )
    .run(args.fen, JSON.stringify(args.moves), args.status, args.winner, endedAt, args.gameId);
  if (r.changes === 0) return null;
  return getChessGame(args.gameId);
}

export function userCanAccessChessGame(
  gameId: string,
  userId: string
): { game: ChessGame; convId: string } | null {
  if (!gameId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.* FROM chess_games g
         JOIN conversation_participants p ON p.conversation_id = g.conv_id
        WHERE g.id = ? AND p.user_id = ?
        LIMIT 1`
    )
    .get(gameId, userId) as any;
  if (!row) return null;
  return { game: parseChessRow(row), convId: row.conv_id };
}

// ----- DAMES -----

function parseDameRow(row: any): DameGame {
  let state: DameGameState = { board: [], turn: 'white' };
  try {
    const p = row.state ? JSON.parse(row.state) : null;
    if (p && Array.isArray(p.board) && (p.turn === 'white' || p.turn === 'black')) {
      state = p as DameGameState;
    }
  } catch { /* ignore */ }
  let moves: DameMove[] = [];
  try {
    const p = row.moves ? JSON.parse(row.moves) : [];
    if (Array.isArray(p)) moves = p as DameMove[];
  } catch { /* ignore */ }
  return {
    id: row.id,
    conv_id: row.conv_id,
    activity_id: row.activity_id ?? null,
    player_white: row.player_white,
    player_black: row.player_black,
    state,
    moves,
    status: (row.status as GameStatus) || 'in_progress',
    winner: row.winner ?? null,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    // Talk2Me #416 (Pascal 2026-06-05) — mode arbitre + pause.
    arbiter: typeof row.arbiter === 'string' && row.arbiter ? row.arbiter : null,
    paused_at: typeof row.paused_at === 'number' ? row.paused_at : null,
  };
}

export function createDameGame(args: {
  convId: string;
  activityId: string | null;
  playerWhite: string;
  playerBlack: string;
  initialState: DameGameState;
  /** Voir createChessGame.arbiter — Talk2Me #416. */
  arbiter?: string | null;
}): DameGame {
  if (!args.convId) throw new Error('convId required');
  if (!args.playerWhite || !args.playerBlack) throw new Error('players required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO dame_games
       (id, conv_id, activity_id, player_white, player_black, state, moves, status, winner, started_at, ended_at, arbiter, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'in_progress', NULL, ?, NULL, ?, NULL)`
  ).run(
    id, args.convId, args.activityId, args.playerWhite, args.playerBlack,
    JSON.stringify(args.initialState), now, args.arbiter || null
  );
  const row = db.prepare('SELECT * FROM dame_games WHERE id = ?').get(id) as any;
  return parseDameRow(row);
}

export function getDameGame(gameId: string): DameGame | null {
  if (!gameId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM dame_games WHERE id = ?').get(gameId) as any;
  return row ? parseDameRow(row) : null;
}

export function getActiveDameGameForConv(convId: string): DameGame | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM dame_games WHERE conv_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    )
    .get(convId) as any;
  return row ? parseDameRow(row) : null;
}

export function applyDameMove(args: {
  gameId: string;
  state: DameGameState;
  moves: DameMove[];
  status: GameStatus;
  winner: string | null;
}): DameGame | null {
  const db = getDb();
  const now = Date.now();
  const endedAt = args.status === 'in_progress' ? null : now;
  const r = db
    .prepare(
      `UPDATE dame_games
         SET state = ?, moves = ?, status = ?, winner = ?, ended_at = COALESCE(?, ended_at)
         WHERE id = ?`
    )
    .run(
      JSON.stringify(args.state), JSON.stringify(args.moves), args.status, args.winner,
      endedAt, args.gameId
    );
  if (r.changes === 0) return null;
  return getDameGame(args.gameId);
}

export function userCanAccessDameGame(
  gameId: string,
  userId: string
): { game: DameGame; convId: string } | null {
  if (!gameId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.* FROM dame_games g
         JOIN conversation_participants p ON p.conversation_id = g.conv_id
        WHERE g.id = ? AND p.user_id = ?
        LIMIT 1`
    )
    .get(gameId, userId) as any;
  if (!row) return null;
  return { game: parseDameRow(row), convId: row.conv_id };
}

// ============ Talk2Me #416 (Pascal 2026-06-05) — Find-or-create + pause/resume ============
// Pascal verbatim : "Comme ça on a pas fini, on reprend là où on s'est arrêté.
// On peut aussi reprendre une partie fraîche."
//
// Doctrine [[talktome-produit-abouti]] : la partie en cours est PERSISTANTE,
// reprise transparente possible entre 2 humains OU avec Léa.

type GameTable = 'chess_games' | 'dame_games';

/**
 * Cherche une partie 'in_progress' (peut être pausée) entre 2 user_ids dans
 * une conversation donnée. Sert à la détection "partie en cours" avant de
 * proposer "Reprendre / Nouvelle partie".
 *
 * Si convId est fourni, restreint à cette conv ; sinon cherche dans tout
 * l'historique entre les 2 users (utile pour mode arbitre qui doit retrouver
 * une partie déjà ouverte dans la même conv P2P).
 */
export function getInProgressGameBetween(
  table: GameTable,
  userA: string,
  userB: string,
  convId?: string
): ChessGame | DameGame | null {
  if (!userA || !userB || userA === userB) return null;
  const db = getDb();
  const sql = `
    SELECT * FROM ${table}
     WHERE status = 'in_progress'
       AND (
         (player_white = ? AND player_black = ?)
         OR (player_white = ? AND player_black = ?)
       )
       ${convId ? 'AND conv_id = ?' : ''}
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const params = convId
    ? [userA, userB, userB, userA, convId]
    : [userA, userB, userB, userA];
  const row = db.prepare(sql).get(...params) as any;
  if (!row) return null;
  return table === 'chess_games' ? parseChessRow(row) : parseDameRow(row);
}

/**
 * Cherche une partie 'in_progress' de cet user contre Léa (LEA_PLAYER_ID).
 * Si convId fourni → restreint à cette conv (cas mode solo : conv agent du
 * user).
 */
export function getInProgressGameForUser(
  table: GameTable,
  userId: string,
  convId?: string
): ChessGame | DameGame | null {
  if (!userId) return null;
  const db = getDb();
  const LEA = 'lea';
  const sql = `
    SELECT * FROM ${table}
     WHERE status = 'in_progress'
       AND (
         (player_white = ? AND player_black = ?)
         OR (player_white = ? AND player_black = ?)
       )
       ${convId ? 'AND conv_id = ?' : ''}
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const params = convId
    ? [userId, LEA, LEA, userId, convId]
    : [userId, LEA, LEA, userId];
  const row = db.prepare(sql).get(...params) as any;
  if (!row) return null;
  return table === 'chess_games' ? parseChessRow(row) : parseDameRow(row);
}

/** Marque la partie en pause (idempotent). */
export function pauseGame(table: GameTable, gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE ${table} SET paused_at = ? WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

/** Reprend la partie (clear paused_at). Idempotent. */
export function resumeGame(table: GameTable, gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE ${table} SET paused_at = NULL WHERE id = ? AND status = 'in_progress'`
    )
    .run(gameId);
  return r.changes > 0;
}

/**
 * Abandonne (status = 'abandoned' via white_won/black_won) une partie pour
 * permettre l'ouverture d'une nouvelle. Utilisé par find-or-create?force_new=true.
 * Sentinel winner='abandoned' n'existe pas dans le schema ; on use 'draw' avec
 * winner null pour ne pas attribuer victoire abusive. C'est une convention :
 * "abandonnée sans winner".
 */
export function abandonChessGame(gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE chess_games SET status = 'draw', winner = NULL, ended_at = ?, paused_at = NULL
         WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

export function abandonDameGame(gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE dame_games SET status = 'draw', winner = NULL, ended_at = ?, paused_at = NULL
         WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

/**
 * Retourne le timestamp du dernier coup joué dans une partie (basé sur
 * started_at + nb de moves * dt approximatif est faux ; on relit le row pour
 * `ended_at` à défaut, mais le vrai "last move time" n'est pas stocké).
 * Pour la phase 5 GameInviteCard "Dernier coup : il y a 2 heures", on
 * approxime via paused_at si présent, sinon started_at (acceptable MVP).
 */
export function getGameLastActivityTs(g: ChessGame | DameGame): number {
  return g.paused_at || g.ended_at || g.started_at;
}

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
    'INSERT INTO messages (id, conversation_id, role, text, links, created_at, youtube, places, requires_geoloc, recipe, products, wikipedia, weather, web_search, tiktok, quoted_message_id, kind, ai_for_user_id, ai_name, ai_avatar_url, sender_id, media, attached_cards) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
    attachedCardsJson
  );

  // Phase 3 : maj preview conversation pour la liste /messages.
  try {
    let preview = (text || '').trim().slice(0, 140);
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
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as any[];

  return rows.map(parseMessageRow);
}

// ============ friendships ============
// /lib/db/friendships.ts — Graphe d'amitié (symétrique).


export interface DbFriendship {
  id: string;
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: number;
}

/** Normalise une paire d'IDs (user_a < user_b lexicographiquement). */
function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Crée une amitié (symétrique). Retourne la friendship existante si déjà créée.
 * Impossible d'être ami avec soi-même.
 */
export function addFriend(userIdA: string, userIdB: string): DbFriendship {
  if (!userIdA || !userIdB) throw new Error('user ids required');
  if (userIdA === userIdB) throw new Error('cannot_friend_self');
  const db = getDb();
  // Sanity : les 2 users existent
  if (!getUserById(userIdA) || !getUserById(userIdB)) {
    throw new Error('user_not_found');
  }
  const [a, b] = normalizePair(userIdA, userIdB);
  const existing = db
    .prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?')
    .get(a, b) as any;
  if (existing) {
    return {
      id: existing.id,
      user_a: existing.user_a,
      user_b: existing.user_b,
      status: existing.status,
      created_at: existing.created_at,
    };
  }
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO friendships (id, user_a, user_b, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, a, b, 'accepted', now);
  return { id, user_a: a, user_b: b, status: 'accepted', created_at: now };
}

/** Supprime une amitié (symétrique). Retourne true si une ligne a été supprimée. */
export function removeFriend(userIdA: string, userIdB: string): boolean {
  if (!userIdA || !userIdB) return false;
  const db = getDb();
  const [a, b] = normalizePair(userIdA, userIdB);
  const r = db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
  return r.changes > 0;
}

/** Liste les amis d'un user (status = accepted). Retourne le User "autre". */
export function listFriends(userId: string): DbUser[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.* FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
         ORDER BY f.created_at DESC`
    )
    .all(userId, userId, userId) as any[];
  return rows.map(parseUserRow);
}

/**
 * Talk2Me PII security (Pascal 2026-06-05) — IDs uniquement des amis acceptés.
 * Helper pour scoper les recherches de l'IA T2M Officiel : current user + amis
 * sont les seuls users visibles. Le reste de la DB est INVISIBLE pour l'IA.
 * Doctrine [[talk2me-pii-security]].
 */
export function listFriendIds(userId: string): string[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS friend_id
         FROM friendships
         WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'`
    )
    .all(userId, userId, userId) as Array<{ friend_id: string }>;
  return rows.map((r) => r.friend_id);
}

/** Vérifie si 2 users sont amis (status accepted). */
export function isFriend(userIdA: string, userIdB: string): boolean {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const db = getDb();
  const [a, b] = normalizePair(userIdA, userIdB);
  const row = db
    .prepare("SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted' LIMIT 1")
    .get(a, b);
  return !!row;
}

/** Compte les amis acceptés d'un user. */
export function countFriends(userId: string): number {
  if (!userId) return 0;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'"
    )
    .get(userId, userId) as { c?: number } | undefined;
  return row?.c ?? 0;
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
  };
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
    'INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, attached_audio_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    userId,
    input.type,
    input.media_url ?? null,
    input.caption ?? null,
    input.text ?? null,
    input.bg_variant ?? null,
    input.attached_audio_json ?? null,
    now
  );
  const row = db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(id) as any;
  const parsed = parseDirectCardRow(row);

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

export function getDirectCards(limit = 50, offset = 0): DbDirectCard[] {
  const db = getDb();
  // Lot A : exclut soft-deleted ET archivées du feed public.
  const rows = db
    .prepare(
      'SELECT * FROM direct_cards WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .all(limit, offset) as any[];
  return rows.map(parseDirectCardRow);
}

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
function indexCardSafely(
  kind: CardSearchKind,
  cardId: string,
  map: CardMetadataMap,
): void {
  try {
    const json = JSON.stringify(map);
    if (kind === 'post') setPostMetadataMap(cardId, json);
    else setDirectCardMetadataMap(cardId, json);
    upsertCardSearchIndex(kind, cardId, searchableFromMap(map));
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
export function getMixedFeed(
  limit = 20,
  offset = 0,
  opts?: { authorIds?: string[]; sort?: 'recent' | 'popular' }
): Array<
  | { kind: 'post'; data: DbPostWithMessagesAndAuthor }
  | { kind: 'direct'; data: DbDirectCardWithAuthor }
> {
  // Tri Hub (Pascal 2026-06-07) : "recent" (date, défaut) ou "popular"
  // (engagement = likes×3 + vues). Filtre "Amis" : ne garder que les posts
  // d'une liste d'auteurs. Dans les deux cas on élargit le pool car le bon
  // sous-ensemble peut être épars dans le flux global.
  const authorSet =
    opts?.authorIds && opts.authorIds.length ? new Set(opts.authorIds) : null;
  const sort = opts?.sort ?? 'recent';
  // On charge un peu plus de chaque côté, on merge, on tranche
  const pool = authorSet || sort === 'popular' ? 1000 : limit + offset;
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
  if (sort === 'popular') {
    // Engagement = likes×3 + vues. Égalité → le plus récent d'abord.
    const pop = (d: { likes?: number; views?: number }) =>
      (d.likes ?? 0) * 3 + (d.views ?? 0);
    merged.sort((a, b) => pop(b.data) - pop(a.data) || b.ts - a.ts);
  } else {
    merged.sort((a, b) => b.ts - a.ts);
  }
  const scoped = authorSet
    ? merged.filter((m) => authorSet.has(m.data.user_id))
    : merged;
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
  windowDays: number = 30
): TrashCardItem[] {
  if (!userId) return [];
  const db = getDb();
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // 1) Direct cards soft-deleted dans la fenêtre
  const dcRows = db
    .prepare(
      'SELECT * FROM direct_cards WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
    )
    .all(userId, cutoff) as any[];
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
      'SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC'
    )
    .all(userId, cutoff) as any[];

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
// /lib/db/saved_cards.ts — Cards réutilisables sauvegardées par l'user
// (bookmarks). Doctrine [[talktome-conversation-avant-recherche]].


export type SavedCardKind =
  | 'youtube'
  | 'place'
  | 'recipe'
  | 'wikipedia'
  | 'weather'
  | 'product'
  | 'web_search'
  | 'video_card'
  | 'image_card'
  | 'texte_card';

export interface DbSavedCard {
  id: string;
  user_id: string;
  source_message_id: string | null;
  source_conv_id: string | null;
  card_kind: SavedCardKind;
  card_data: unknown; // JSON parsed
  title: string | null;
  note: string | null;
  saved_at: number;
}

function parseSavedCardRow(row: any): DbSavedCard {
  let data: unknown = null;
  try {
    data = row.card_data ? JSON.parse(row.card_data) : null;
  } catch {
    data = null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    source_message_id: typeof row.source_message_id === 'string' ? row.source_message_id : null,
    source_conv_id: typeof row.source_conv_id === 'string' ? row.source_conv_id : null,
    card_kind: row.card_kind as SavedCardKind,
    card_data: data,
    title: typeof row.title === 'string' ? row.title : null,
    note: typeof row.note === 'string' ? row.note : null,
    saved_at: row.saved_at,
  };
}

export function saveCard(args: {
  userId: string;
  cardKind: SavedCardKind;
  cardData: unknown;
  sourceMessageId?: string | null;
  sourceConvId?: string | null;
  title?: string | null;
  note?: string | null;
}): DbSavedCard {
  const userId = (args.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  if (!args.cardKind) throw new Error('card_kind_required');
  if (args.cardData === undefined || args.cardData === null) {
    throw new Error('card_data_required');
  }
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const dataJson = JSON.stringify(args.cardData);
  if (dataJson.length > 200_000) throw new Error('card_too_large');
  db.prepare(
    'INSERT INTO saved_cards (id, user_id, source_message_id, source_conv_id, card_kind, card_data, title, note, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    userId,
    args.sourceMessageId ?? null,
    args.sourceConvId ?? null,
    args.cardKind,
    dataJson,
    args.title ?? null,
    args.note ?? null,
    now
  );
  const row = db.prepare('SELECT * FROM saved_cards WHERE id = ?').get(id) as any;
  return parseSavedCardRow(row);
}

export function getSavedCards(
  userId: string,
  limit: number = 50,
  offset: number = 0
): DbSavedCard[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  const rows = db
    .prepare(
      'SELECT * FROM saved_cards WHERE user_id = ? ORDER BY saved_at DESC LIMIT ? OFFSET ?'
    )
    .all(userId, n, off) as any[];
  return rows.map(parseSavedCardRow);
}

export function getSavedCardById(userId: string, cardId: string): DbSavedCard | null {
  if (!userId || !cardId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM saved_cards WHERE id = ? AND user_id = ?')
    .get(cardId, userId) as any;
  return row ? parseSavedCardRow(row) : null;
}

export function deleteSavedCard(userId: string, cardId: string): boolean {
  if (!userId || !cardId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM saved_cards WHERE id = ? AND user_id = ?')
    .run(cardId, userId);
  return r.changes > 0;
}

export function updateSavedCard(
  userId: string,
  cardId: string,
  patch: { title?: string | null; note?: string | null; cardData?: unknown }
): DbSavedCard | null {
  if (!userId || !cardId) return null;
  const existing = getSavedCardById(userId, cardId);
  if (!existing) return null;
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    vals.push(patch.title);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    vals.push(patch.note);
  }
  if (patch.cardData !== undefined) {
    sets.push('card_data = ?');
    vals.push(JSON.stringify(patch.cardData));
  }
  if (sets.length === 0) return existing;
  vals.push(cardId, userId);
  db.prepare(`UPDATE saved_cards SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(
    ...vals
  );
  return getSavedCardById(userId, cardId);
}

// ============ habits ============
// /lib/db/habits.ts — User habits (apprentissage passif des préférences).
// Doctrine [[talk2me-roadmap-6-phases]] Phase 1.


export type UserHabitKind =
  | 'music_artist'
  | 'music_genre'
  | 'food_pref'
  | 'place_visited'
  | 'topic'
  | 'contact'
  | 'search_pattern';

export const USER_HABIT_KINDS: UserHabitKind[] = [
  'music_artist',
  'music_genre',
  'food_pref',
  'place_visited',
  'topic',
  'contact',
  'search_pattern',
];

export interface DbUserHabit {
  id: string;
  user_id: string;
  kind: UserHabitKind;
  value: string;
  score: number;
  occurrences: number;
  first_seen_at: number;
  last_seen_at: number;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

function parseUserHabitRow(row: any): DbUserHabit {
  const rawKind = typeof row.kind === 'string' ? row.kind : 'topic';
  const kind = (USER_HABIT_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as UserHabitKind)
    : 'topic';
  let metadata: Record<string, unknown> | null = null;
  if (typeof row.metadata === 'string' && row.metadata.length > 0) {
    try {
      const parsed = JSON.parse(row.metadata);
      if (parsed && typeof parsed === 'object') {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    kind,
    value: row.value ?? '',
    score: typeof row.score === 'number' ? row.score : 1.0,
    occurrences: typeof row.occurrences === 'number' ? row.occurrences : 1,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    source: typeof row.source === 'string' ? row.source : null,
    metadata,
  };
}

/** Boost score appliqué à chaque nouvelle occurrence (cap à 50). */
const HABIT_BOOST_DELTA = 0.6;
const HABIT_SCORE_CAP = 50;

/** Normalise une valeur (trim + collapse whitespace + cap 80 chars). */
function normalizeHabitValue(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.slice(0, 80);
}

/**
 * UPSERT idempotent par (user_id, kind, value).
 * - Première insertion : score = 1.0, occurrences = 1
 * - Doublon : occurrences++ + score += HABIT_BOOST_DELTA (cap) + touch last_seen_at
 * Retourne l'habit final ou null si invalide.
 */
export function upsertUserHabit(
  userId: string,
  kind: UserHabitKind,
  value: string,
  source?: string,
  metadata?: Record<string, unknown>,
): DbUserHabit | null {
  if (!userId) return null;
  if (!(USER_HABIT_KINDS as readonly string[]).includes(kind)) return null;
  const cleanValue = normalizeHabitValue(value || '');
  if (!cleanValue) return null;

  const db = getDb();
  const now = Date.now();
  const metaJson = metadata ? JSON.stringify(metadata) : null;
  const cleanSource = typeof source === 'string' ? source.slice(0, 40) : null;

  const tx = db.transaction((): DbUserHabit | null => {
    const existing = db
      .prepare(
        'SELECT * FROM user_habits WHERE user_id = ? AND kind = ? AND value = ? LIMIT 1',
      )
      .get(userId, kind, cleanValue) as any;
    if (existing) {
      const newOcc = (existing.occurrences || 0) + 1;
      const newScore = Math.min(
        HABIT_SCORE_CAP,
        (typeof existing.score === 'number' ? existing.score : 1.0) +
          HABIT_BOOST_DELTA,
      );
      db.prepare(
        'UPDATE user_habits SET occurrences = ?, score = ?, last_seen_at = ?, source = COALESCE(?, source), metadata = COALESCE(?, metadata) WHERE id = ?',
      ).run(newOcc, newScore, now, cleanSource, metaJson, existing.id);
      const updated = db
        .prepare('SELECT * FROM user_habits WHERE id = ?')
        .get(existing.id) as any;
      return parseUserHabitRow(updated);
    }
    const id = randomUUID();
    db.prepare(
      'INSERT INTO user_habits (id, user_id, kind, value, score, occurrences, first_seen_at, last_seen_at, source, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, userId, kind, cleanValue, 1.0, 1, now, now, cleanSource, metaJson);
    return {
      id,
      user_id: userId,
      kind,
      value: cleanValue,
      score: 1.0,
      occurrences: 1,
      first_seen_at: now,
      last_seen_at: now,
      source: cleanSource,
      metadata: metadata ?? null,
    };
  });
  return tx();
}

/**
 * Liste les habits du user, optionnellement filtrés par kind.
 * Tri : score DESC, last_seen_at DESC. Limit default 50, cap 200.
 */
export function getUserHabits(
  userId: string,
  kind?: UserHabitKind,
  limit: number = 50,
): DbUserHabit[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  let rows: any[];
  if (kind && (USER_HABIT_KINDS as readonly string[]).includes(kind)) {
    rows = db
      .prepare(
        'SELECT * FROM user_habits WHERE user_id = ? AND kind = ? ORDER BY score DESC, last_seen_at DESC LIMIT ?',
      )
      .all(userId, kind, n) as any[];
  } else {
    rows = db
      .prepare(
        'SELECT * FROM user_habits WHERE user_id = ? ORDER BY score DESC, last_seen_at DESC LIMIT ?',
      )
      .all(userId, n) as any[];
  }
  return rows.map(parseUserHabitRow);
}

/** Groupé par kind, top N par groupe. */
export function getUserHabitsGrouped(
  userId: string,
  perKindLimit: number = 10,
): Record<UserHabitKind, DbUserHabit[]> {
  const out = {} as Record<UserHabitKind, DbUserHabit[]>;
  for (const k of USER_HABIT_KINDS) {
    out[k] = getUserHabits(userId, k, perKindLimit);
  }
  return out;
}

export function deleteUserHabit(userId: string, habitId: string): boolean {
  if (!userId || !habitId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM user_habits WHERE id = ? AND user_id = ?')
    .run(habitId, userId);
  return r.changes > 0;
}

export function deleteAllUserHabits(userId: string): number {
  if (!userId) return 0;
  const db = getDb();
  const r = db.prepare('DELETE FROM user_habits WHERE user_id = ?').run(userId);
  return r.changes;
}

/**
 * Décay temporel : multiplie le score par 0.95 pour les habits dont
 * last_seen_at > 30 jours. Supprime les habits dont score < 0.1 après décay.
 * Retourne { decayed, pruned } pour observabilité.
 */
export function decayUserHabits(userId: string): { decayed: number; pruned: number } {
  if (!userId) return { decayed: 0, pruned: 0 };
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const decay = db
    .prepare(
      'UPDATE user_habits SET score = score * 0.95 WHERE user_id = ? AND last_seen_at < ?',
    )
    .run(userId, cutoff);
  const prune = db
    .prepare('DELETE FROM user_habits WHERE user_id = ? AND score < 0.1')
    .run(userId);
  return { decayed: decay.changes, pruned: prune.changes };
}

/**
 * Décay opportuniste : si dernière décay > 24h, lance décay (et touch
 * users.last_habits_decay_at). Idempotent, non bloquant côté caller.
 */
export function maybeDecayUserHabits(userId: string): void {
  if (!userId) return;
  const db = getDb();
  try {
    const row = db
      .prepare('SELECT last_habits_decay_at FROM users WHERE id = ?')
      .get(userId) as any;
    const last =
      typeof row?.last_habits_decay_at === 'number' ? row.last_habits_decay_at : 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    decayUserHabits(userId);
    db.prepare('UPDATE users SET last_habits_decay_at = ? WHERE id = ?').run(
      Date.now(),
      userId,
    );
  } catch (e) {
    console.warn('[db] maybeDecayUserHabits skipped:', e);
  }
}

// ============ memories ============
// /lib/db/memories.ts — Mémoires long terme de l'IA personnelle, strictement
// isolées par user_id. Doctrine [[talktome-ia-persistance-isolation]].


export type AiMemoryKind = 'preference' | 'habit' | 'fact' | 'style';

export interface DbAiMemory {
  id: string;
  user_id: string;
  kind: AiMemoryKind;
  content: string;
  weight: number;
  source_conv_id: string | null;
  source_message_id: string | null;
  created_at: number;
  last_used_at: number | null;
}

function parseAiMemoryRow(row: any): DbAiMemory {
  const k = row.kind;
  const kind: AiMemoryKind =
    k === 'habit' || k === 'fact' || k === 'style' ? k : 'preference';
  return {
    id: row.id,
    user_id: row.user_id,
    kind,
    content: row.content ?? '',
    weight: typeof row.weight === 'number' ? row.weight : 1.0,
    source_conv_id: typeof row.source_conv_id === 'string' ? row.source_conv_id : null,
    source_message_id:
      typeof row.source_message_id === 'string' ? row.source_message_id : null,
    created_at: row.created_at,
    last_used_at: typeof row.last_used_at === 'number' ? row.last_used_at : null,
  };
}

export interface AddAiMemoryInput {
  userId: string;
  kind?: AiMemoryKind;
  content: string;
  sourceConvId?: string | null;
  sourceMessageId?: string | null;
  weight?: number;
}

export function addAiMemory(input: AddAiMemoryInput): DbAiMemory {
  const userId = (input.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  const content = (input.content || '').trim();
  if (!content) throw new Error('content_required');
  if (content.length > 500) throw new Error('content_too_long');
  const kind: AiMemoryKind =
    input.kind === 'habit' || input.kind === 'fact' || input.kind === 'style'
      ? input.kind
      : 'preference';
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const weight = typeof input.weight === 'number' && input.weight > 0 ? input.weight : 1.0;
  db.prepare(
    'INSERT INTO ai_memories (id, user_id, kind, content, weight, source_conv_id, source_message_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
  ).run(
    id,
    userId,
    kind,
    content,
    weight,
    input.sourceConvId ?? null,
    input.sourceMessageId ?? null,
    now
  );
  return {
    id,
    user_id: userId,
    kind,
    content,
    weight,
    source_conv_id: input.sourceConvId ?? null,
    source_message_id: input.sourceMessageId ?? null,
    created_at: now,
    last_used_at: null,
  };
}

/**
 * Récupère les memories du user owner — top N par weight DESC + recency.
 * STRICTEMENT scopé user_id, jamais cross-user (isolation).
 */
export function getAiMemories(userId: string, limit: number = 20): DbAiMemory[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = db
    .prepare(
      'SELECT * FROM ai_memories WHERE user_id = ? ORDER BY weight DESC, created_at DESC LIMIT ?'
    )
    .all(userId, n) as any[];
  return rows.map(parseAiMemoryRow);
}

export function deleteAiMemory(userId: string, memoryId: string): boolean {
  if (!userId || !memoryId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM ai_memories WHERE id = ? AND user_id = ?')
    .run(memoryId, userId);
  return r.changes > 0;
}

export function touchAiMemoryUsage(memoryId: string): void {
  if (!memoryId) return;
  const db = getDb();
  db.prepare('UPDATE ai_memories SET last_used_at = ? WHERE id = ?').run(
    Date.now(),
    memoryId
  );
}

// ============ route_learnings ============
// /lib/db/route_learnings.ts — Apprentissage per-user des chaînes d'outils
// qui fonctionnent (Talk2Me #340, Lot 1bis Couche B).


export interface DbRouteLearning {
  id: string;
  user_id: string;
  intent: string;
  tool_chain: string[];
  success_score: number;
  last_used_at: number;
  occurrences: number;
}

/**
 * Log un attempt route (fire-and-forget recommandé côté caller).
 * Upsert : si (user, intent, chain) existe → score += delta, occurrences++,
 * last_used_at refresh. Sinon insert avec score initial = delta.
 *
 * Score clamp : [-2, 2] pour éviter qu'une route préférée éclipse définitivement
 * les autres (laisse une chance aux nouvelles routes).
 */
export function logRouteAttempt(
  userId: string,
  intent: string,
  toolChain: string[],
  scoreDelta: number,
): void {
  if (!userId || !intent || !Array.isArray(toolChain)) return;
  const chainStr = JSON.stringify(toolChain);
  const now = Date.now();
  const db = getDb();
  try {
    const existing = db
      .prepare(
        'SELECT id, success_score, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? AND tool_chain = ?',
      )
      .get(userId, intent, chainStr) as
      | { id: string; success_score: number; occurrences: number }
      | undefined;
    if (existing) {
      const newScore = Math.max(
        -2,
        Math.min(2, (existing.success_score || 0) + scoreDelta),
      );
      db.prepare(
        'UPDATE route_learnings SET success_score = ?, last_used_at = ?, occurrences = occurrences + 1 WHERE id = ?',
      ).run(newScore, now, existing.id);
    } else {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO route_learnings (id, user_id, intent, tool_chain, success_score, last_used_at, occurrences) VALUES (?, ?, ?, ?, ?, ?, 1)',
      ).run(id, userId, intent, chainStr, scoreDelta, now);
    }
  } catch (e) {
    console.error('[db] logRouteAttempt error', e);
  }
}

/**
 * Renvoie la chaîne de tools préférée pour ce (user, intent), ou null si
 * aucune attempt enregistrée.
 */
export function getPreferredRoute(
  userId: string,
  intent: string,
): DbRouteLearning | null {
  if (!userId || !intent) return null;
  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, user_id, intent, tool_chain, success_score, last_used_at, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? ORDER BY success_score DESC, last_used_at DESC LIMIT 1',
    )
    .get(userId, intent) as
    | {
        id: string;
        user_id: string;
        intent: string;
        tool_chain: string;
        success_score: number;
        last_used_at: number;
        occurrences: number;
      }
    | undefined;
  if (!row) return null;
  let chain: string[] = [];
  try {
    const parsed = JSON.parse(row.tool_chain);
    if (Array.isArray(parsed)) chain = parsed.filter((x) => typeof x === 'string');
  } catch {
    /* ignore corrupted row */
  }
  return {
    id: row.id,
    user_id: row.user_id,
    intent: row.intent,
    tool_chain: chain,
    success_score: row.success_score,
    last_used_at: row.last_used_at,
    occurrences: row.occurrences,
  };
}

/**
 * Renvoie les N routes les mieux scorées pour ce (user, intent), classées
 * par score décroissant. Utile pour proposer le 2e best comme fallback.
 */
export function getRouteFallbacks(
  userId: string,
  intent: string,
  limit = 3,
): DbRouteLearning[] {
  if (!userId || !intent) return [];
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, user_id, intent, tool_chain, success_score, last_used_at, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? ORDER BY success_score DESC, last_used_at DESC LIMIT ?',
    )
    .all(userId, intent, limit) as Array<{
    id: string;
    user_id: string;
    intent: string;
    tool_chain: string;
    success_score: number;
    last_used_at: number;
    occurrences: number;
  }>;
  return rows.map((r) => {
    let chain: string[] = [];
    try {
      const parsed = JSON.parse(r.tool_chain);
      if (Array.isArray(parsed)) chain = parsed.filter((x) => typeof x === 'string');
    } catch {
      /* ignore */
    }
    return {
      id: r.id,
      user_id: r.user_id,
      intent: r.intent,
      tool_chain: chain,
      success_score: r.success_score,
      last_used_at: r.last_used_at,
      occurrences: r.occurrences,
    };
  });
}

// ============ drafts ============
// /lib/db/drafts.ts — Brouillons de cards (auto-save image/video/texte).
// Doctrine [[talk2me-card-editor-ia]].


export type CardDraftType = 'image' | 'video' | 'texte';

export interface DbCardDraft {
  id: string;
  user_id: string;
  type: CardDraftType;
  draft_data: unknown; // JSON parsed
  thumbnail_url: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

function parseCardDraftRow(row: any): DbCardDraft {
  let data: unknown = null;
  try {
    data = row.draft_data ? JSON.parse(row.draft_data) : null;
  } catch {
    data = null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as CardDraftType,
    draft_data: data,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    title: typeof row.title === 'string' ? row.title : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Upsert d'un brouillon. Si id fourni et appartient au user → update.
 * Sinon → insert (avec id généré ou id fourni).
 */
export function saveDraft(args: {
  id?: string | null;
  userId: string;
  type: CardDraftType;
  draftData: unknown;
  thumbnailUrl?: string | null;
  title?: string | null;
}): DbCardDraft {
  const userId = (args.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  if (!args.type) throw new Error('type_required');
  if (!['image', 'video', 'texte'].includes(args.type)) {
    throw new Error('type_invalid');
  }
  if (args.draftData === undefined || args.draftData === null) {
    throw new Error('draft_data_required');
  }
  const db = getDb();
  const now = Date.now();
  const dataJson = JSON.stringify(args.draftData);
  if (dataJson.length > 500_000) throw new Error('draft_too_large');

  // Si id fourni → tentative d'update
  if (args.id) {
    const existing = db
      .prepare('SELECT id FROM card_drafts WHERE id = ? AND user_id = ?')
      .get(args.id, userId) as { id?: string } | undefined;
    if (existing?.id) {
      db.prepare(
        `UPDATE card_drafts
           SET type = ?, draft_data = ?, thumbnail_url = ?, title = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
      ).run(
        args.type,
        dataJson,
        args.thumbnailUrl ?? null,
        args.title ?? null,
        now,
        args.id,
        userId
      );
      const row = db.prepare('SELECT * FROM card_drafts WHERE id = ?').get(args.id) as any;
      return parseCardDraftRow(row);
    }
  }

  const id = args.id || randomUUID();
  db.prepare(
    `INSERT INTO card_drafts
       (id, user_id, type, draft_data, thumbnail_url, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    args.type,
    dataJson,
    args.thumbnailUrl ?? null,
    args.title ?? null,
    now,
    now
  );
  const row = db.prepare('SELECT * FROM card_drafts WHERE id = ?').get(id) as any;
  return parseCardDraftRow(row);
}

export function getDrafts(userId: string, limit = 50, offset = 0): DbCardDraft[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  const rows = db
    .prepare(
      'SELECT * FROM card_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    .all(userId, n, off) as any[];
  return rows.map(parseCardDraftRow);
}

export function getDraft(userId: string, draftId: string): DbCardDraft | null {
  if (!userId || !draftId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM card_drafts WHERE id = ? AND user_id = ?')
    .get(draftId, userId) as any;
  return row ? parseCardDraftRow(row) : null;
}

export function deleteDraft(userId: string, draftId: string): boolean {
  if (!userId || !draftId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM card_drafts WHERE id = ? AND user_id = ?')
    .run(draftId, userId);
  return r.changes > 0;
}

// ============ tutorial ============
// /lib/db/tutorial.ts — Tutorial steps (T2M Officiel IA institutionnelle).
// Doctrine [[talk2me-officiel-ia]] — DB-only, aucun appel externe.


export interface TutorialStep {
  id: string;
  topic: string;
  step_order: number;
  title: string;
  body: string;
  media_url: string | null;
  next_action: string | null;
}

/** Récupère un tuto complet (steps ordonnés) par topic. */
export function getTutorial(
  topic: string,
): { topic: string; steps: TutorialStep[] } | null {
  if (!topic) return null;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, topic, step_order, title, body, media_url, next_action
         FROM tutorial_steps
         WHERE topic = ?
         ORDER BY step_order ASC`,
    )
    .all(topic.trim()) as TutorialStep[];
  if (!rows || rows.length === 0) return null;
  return { topic: topic.trim(), steps: rows };
}

/** Upsert d'un step de tuto (utilisé par le seed). */
export function upsertTutorialStep(step: {
  id?: string;
  topic: string;
  step_order: number;
  title: string;
  body: string;
  media_url?: string | null;
  next_action?: string | null;
}): TutorialStep {
  const db = getDb();
  const id = step.id || randomUUID();
  const now = Date.now();
  // Replace step at same (topic, step_order)
  db.prepare(
    `DELETE FROM tutorial_steps WHERE topic = ? AND step_order = ?`,
  ).run(step.topic, step.step_order);
  db.prepare(
    `INSERT INTO tutorial_steps (id, topic, step_order, title, body, media_url, next_action, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    step.topic,
    step.step_order,
    step.title,
    step.body,
    step.media_url ?? null,
    step.next_action ?? null,
    now,
  );
  return {
    id,
    topic: step.topic,
    step_order: step.step_order,
    title: step.title,
    body: step.body,
    media_url: step.media_url ?? null,
    next_action: step.next_action ?? null,
  };
}

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