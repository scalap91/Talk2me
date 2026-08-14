/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-core — SOCLE RACINE de la couche donnees (decoupage db-core, Pascal 2026-06-30).
 * Connexion getDb() + init du schema (CREATE TABLE/migrations) + types de cartes (Db*)
 * + parsers partages (parse*) + DbUser/CreateUserInput. NE DEPEND D'AUCUN domaine.
 * lib/db.ts re-exporte tout ceci (facade) -> les ~199 appelants from '@/lib/db' inchanges.
 */
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
  source: 'AliExpress' | 'Bing Shopping' | 'CJ' | 'Talk2Me' | 'SHEIN' | 'TEMU' | 'Banggood' | 'BigBuy';
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

// DB débranchable par env : prod (talk2me.fr) et dev (dev.talk2me.fr) ont chacun
// leur base. Par défaut = base prod. L'env DEV pose TALKTOME_DB_PATH sur sa propre DB.
const DB_PATH = process.env.TALKTOME_DB_PATH || process.cwd() + '/data/talktome.db';
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

      -- P2 étape 1 (Pascal 2026-06-15) : MATRICE DE POST unifiée. Table miroir
      -- alimentée par DOUBLE ÉCRITURE depuis posts + direct_cards. Non destructif :
      -- aucune lecture ne s'en sert encore (bascule des lectures = étape 3, sous flag).
      CREATE TABLE IF NOT EXISTS unified_posts (
        source TEXT NOT NULL,            -- 'post' | 'direct_card'
        id TEXT NOT NULL,                -- id d'origine dans la table source
        user_id TEXT NOT NULL,
        post_type TEXT,                  -- 'chat' | 'image' | 'video' | 'texte' | 'boutique' | 'vitrine' | 'piece3d' | 'lea360'
        conversation_id TEXT,
        message_ids TEXT,
        media_url TEXT,
        caption TEXT,
        text TEXT,
        bg_variant TEXT,
        attached_audio_json TEXT,
        attached_product_json TEXT,
        boutique_id TEXT,
        category TEXT,
        ad_listed_at INTEGER,
        ad_city TEXT,
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        save_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        order_position INTEGER,
        metadata_map TEXT,
        boosted_until INTEGER,
        archived_at INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, id)
      );
      CREATE INDEX IF NOT EXISTS idx_unified_posts_created ON unified_posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_unified_posts_user ON unified_posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_unified_posts_type ON unified_posts(post_type);

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
`);
    // Demande d'ami (Pascal 2026-06-16) : qui a INITIÉ (pour afficher « X t'a invité »
    // + accepter/refuser). NULL = anciennes amitiés instantanées (déjà acceptées).
    try { db.exec('ALTER TABLE friendships ADD COLUMN requested_by TEXT'); } catch { /* déjà */ }
    db.exec(`

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

    // WhatsApp-like : préférences PAR-USER sur une conversation (jamais global,
    // comme hidden_at). NULL = pas mis. Épingler / Archiver / Muet. (Lot 1)
    try { db.exec('ALTER TABLE conversation_participants ADD COLUMN pinned_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE conversation_participants ADD COLUMN archived_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE conversation_participants ADD COLUMN muted_until INTEGER'); } catch { /* déjà */ }
    // Masquer une conv de MA liste (slide-supprimer). Rebranché sur la liste LIVE
    // (le module découplé lib/db/conversations n'y était plus relié). (Pascal 2026-07-05)
    try { db.exec('ALTER TABLE conversation_participants ADD COLUMN hidden_at INTEGER'); } catch { /* déjà */ }

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

    // Talk N Drive (Pascal 2026-06-10) — destination + prix sur les courses.
    try { db.exec('ALTER TABLE rides ADD COLUMN dest_lat REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE rides ADD COLUMN dest_lng REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE rides ADD COLUMN fare_cents INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE rides ADD COLUMN distance_m INTEGER'); } catch { /* déjà */ }

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
    // E2EE Phase 1 : enc=1 → `text` contient le CHIFFRÉ (le serveur ne peut pas lire). Pascal 2026-07-09.
    try { db.exec('ALTER TABLE messages ADD COLUMN enc INTEGER DEFAULT 0'); } catch { /* déjà */ }
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
    // Talk2Me Pièce 3D (Pascal 2026-06-14) — photo + mot d'accroche de la salle 3D du user.
    try { db.exec('ALTER TABLE users ADD COLUMN room_photo TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE users ADD COLUMN room_tagline TEXT'); } catch { /* déjà */ }
    // Talk2Me Avatar Streamoji (Pascal 2026-06-17) — corps 3D RÉALISTE de l'IA perso.
    //   ai_avatar_body_url = chemin du GLB plein-corps (rig std + blendshapes ARKit),
    //   streamoji_avatar_id = id de l'avatar côté Streamoji (re-génération à la demande).
    //   Le corps vit dans /piece et est piloté par le cerveau de l'IA (/api/chat).
    try { db.exec('ALTER TABLE users ADD COLUMN ai_avatar_body_url TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE users ADD COLUMN streamoji_avatar_id TEXT'); } catch { /* déjà */ }
    // Talk2Me Studio créatif (Pascal 2026-06-18) — vidéo photoréaliste de l'avatar IA,
    //   générée depuis une photo sur NOTRE GPU (HunyuanVideo I2V, ComfyUI). MP4 servi sous /uploads/avatar-videos/.
    try { db.exec('ALTER TABLE users ADD COLUMN ai_avatar_video_url TEXT'); } catch { /* déjà */ }
    // boutiques masquées du shop (réversible) — Pascal 2026-06-14
    try { db.exec('ALTER TABLE boutiques ADD COLUMN hidden INTEGER DEFAULT 0'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE messages ADD COLUMN quoted_message_id TEXT'); } catch { /* déjà */ }
    // Talk2Me #22 (Pascal 2026-06-09) — suppression de message (soft-delete, réversible).
    try { db.exec('ALTER TABLE messages ADD COLUMN deleted_at INTEGER'); } catch { /* déjà */ }
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
    // Card OS (Pascal 2026-06-30) : le `.card` sérialisé (SuperCard) — source de vérité
    // que le feed LIT via parseCard (au lieu de traduire les colonnes à la volée).
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN dotcard TEXT'); } catch { /* déjà */ }

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
    // Talk2Me #425 — produit attaché à une card (ProductCardData JSON). Card →
    // Hub (description + aperçu) + Shop. NULL si pas de produit.
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN attached_product_json TEXT'); } catch { /* déjà */ }
    // Talk2Me #427 — Boost payant (post gratuit, boost débité du Wallet).
    // boosted_until = timestamp ms jusqu'auquel le post est mis en avant.
    try { db.exec('ALTER TABLE posts ADD COLUMN boosted_until INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN boosted_until INTEGER'); } catch { /* déjà */ }
    // Talk2Me — Petites annonces (Pascal 2026-06-11) : un produit boutique peut
    // être AUSSI publié dans le fil public d'annonces. ad_listed_at = NULL → pas
    // en annonce ; sinon timestamp de publication. ad_city = ville pour le filtre.
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN ad_listed_at INTEGER'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN ad_city TEXT'); } catch { /* déjà */ }
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_direct_cards_ad ON direct_cards(ad_listed_at DESC)'); } catch { /* déjà */ }
    // LOT 2 racine posts (Pascal 2026-06-23) : post_type = sous-type robuste, dérivé UNE fois
    // des marqueurs caption ([PIECE3D]/[PANO360]/[VITRINE]/[LEA360]) au lieu de re-parser la
    // string partout. Additif + réversible. Backfill one-shot des lignes existantes.
    try {
      db.exec('ALTER TABLE direct_cards ADD COLUMN post_type TEXT');
      db.exec(`UPDATE direct_cards SET post_type = CASE
        WHEN caption LIKE '%[PIECE3D]%' THEN 'piece3d'
        WHEN caption LIKE '%[PANO360%'  THEN 'pano360'
        WHEN caption LIKE '%[VITRINE%'  THEN 'vitrine'
        WHEN caption LIKE '%[LEA360]%'  THEN 'lea360'
        ELSE type END
        WHERE post_type IS NULL`);
    } catch { /* déjà */ }
    // Auto-remplit post_type à chaque nouvelle card (sans toucher l'INSERT createDirectCard).
    try {
      db.exec(`CREATE TRIGGER IF NOT EXISTS trg_direct_cards_post_type AFTER INSERT ON direct_cards
        BEGIN
          UPDATE direct_cards SET post_type = CASE
            WHEN NEW.caption LIKE '%[PIECE3D]%' THEN 'piece3d'
            WHEN NEW.caption LIKE '%[PANO360%'  THEN 'pano360'
            WHEN NEW.caption LIKE '%[VITRINE%'  THEN 'vitrine'
            WHEN NEW.caption LIKE '%[LEA360]%'  THEN 'lea360'
            ELSE NEW.type END
          WHERE id = NEW.id AND post_type IS NULL;
        END`);
    } catch { /* déjà */ }
    // Wallet ledger : solde = SUM(amount_cents). Crédits (recharge/affiliation)
    // et débits (boost). Montants en CENTIMES (pas de float).
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT,
        ref_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id, created_at DESC);
    `);
    // Wallet MULTI-DEVISE (Pascal 2026-06-23) : T2M est international, on démarre à
    // Madagascar (MGA) sans s'y enfermer. Chaque ligne porte SA devise ; le solde se
    // calcule PAR devise (jamais d'addition Ar+€). L'existant est rétro-rempli en EUR
    // (c'est ainsi qu'il était affiché). Colonne additive idempotente.
    try { db.exec("ALTER TABLE wallet_transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'"); } catch { /* déjà présente */ }
    // Talk2Me #428 — Boutiques (Pascal). Une boutique = card d'entrée du Shop ;
    // ses produits (direct_cards) sont rangés par catégorie texte libre.
    db.exec(`
      CREATE TABLE IF NOT EXISTS boutiques (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        slug TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_boutiques_user ON boutiques(user_id, created_at DESC);
    `);
    // Talk2Me #428 — slug public (URL talk2me.fr/<slug>) ajouté après coup.
    try { db.exec('ALTER TABLE boutiques ADD COLUMN slug TEXT'); } catch { /* déjà */ }
    try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_boutiques_slug ON boutiques(slug)'); } catch { /* déjà */ }
    // Talk2Me #428 — position de la cover ("X% Y%") ajustée au doigt à la création.
    try { db.exec('ALTER TABLE boutiques ADD COLUMN cover_position TEXT'); } catch { /* déjà */ }
    // Talk2Me #429 — type de boutique : 'stock' (le vendeur a la marchandise) ou
    // 'dropship' (produits fournisseur importés, CJ expédie). Défaut 'stock'.
    try { db.exec("ALTER TABLE boutiques ADD COLUMN kind TEXT NOT NULL DEFAULT 'stock'"); } catch { /* déjà */ }
    // Talk2Me — magasin de clés API + KILL SWITCH : on crée la table et on
    // applique les overrides sur process.env dès le démarrage.
    try { ensureApiKeysTable(db); applyApiKeysToEnv(db); } catch { /* best-effort */ }

    // ===== Chantier SÉPARATION SHOP #1 (Pascal 2026-06-15) =====
    // On retire SEULEMENT les produits de direct_cards (ils n'ont rien à faire
    // dans les cards perso). Le catalogue lui-même vit dans une BASE DÉDIÉE
    // shop.db (cf lib/shop-db.ts, chantier portabilité cross-serveur) qui
    // rapatrie les données. Ici on s'assure juste que direct_cards est propre.
    try {
      db.exec(`DELETE FROM direct_cards WHERE boutique_id IS NOT NULL AND attached_product_json IS NOT NULL;`);
    } catch { /* best-effort */ }

    // ===== Écosystème Talk — COUCHE COMMUNICATION (SMS Talk / Call Talk) =====
    // Doctrine [[project_talk_ecosystem_architecture]] : carnet comm SÉPARÉ des
    // amis T2M, blocage indépendant par couche, pas de L2 ici.
    db.exec(`
      CREATE TABLE IF NOT EXISTS comm_contacts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        label TEXT,
        kind TEXT NOT NULL DEFAULT 'sms',
        status TEXT NOT NULL DEFAULT 'active',  -- active | blocked (blocage couche comm)
        created_at INTEGER NOT NULL,
        UNIQUE(owner_id, contact_id)
      );
      CREATE INDEX IF NOT EXISTS idx_comm_contacts_owner ON comm_contacts(owner_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS sms_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sms_pair ON sms_messages(sender_id, recipient_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sms_recipient ON sms_messages(recipient_id, created_at DESC);

      -- Talk N Drive (#23, Brique 1 distribution) — ride-hailing tuk-tuk.
      -- App /drive partageant DB+compte T2M. Asset-light : on relie, cash à bord,
      -- ZÉRO paiement in-app. Doctrine [[project_talk2me_distribution_acheminement]].
      CREATE TABLE IF NOT EXISTS drivers (
        user_id TEXT PRIMARY KEY,
        vehicle_type TEXT NOT NULL DEFAULT 'tuktuk',  -- tuktuk | moto | voiture
        is_online INTEGER NOT NULL DEFAULT 0,
        last_lat REAL,
        last_lng REAL,
        last_seen_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, last_seen_at);
      CREATE TABLE IF NOT EXISTS rides (
        id TEXT PRIMARY KEY,
        rider_id TEXT NOT NULL,
        driver_id TEXT,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        pickup_label TEXT,
        dropoff_label TEXT,
        dest_lat REAL,
        dest_lng REAL,
        fare_cents INTEGER,
        distance_m INTEGER,
        status TEXT NOT NULL DEFAULT 'demandee', -- demandee|acceptee|en_route|a_bord|terminee|annulee
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides(rider_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, status);
      CREATE TABLE IF NOT EXISTS ride_events (
        id TEXT PRIMARY KEY,
        ride_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        actor_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ride_events_ride ON ride_events(ride_id, created_at);
      -- Favori chauffeur = l'anti-Uber : la relation appartient au passager.
      CREATE TABLE IF NOT EXISTS favorite_drivers (
        rider_id TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (rider_id, driver_id)
      );

      -- Talk2Me #429 — adresse de livraison du Shop (1 par user, modifiable).
      CREATE TABLE IF NOT EXISTS shipping_addresses (
        user_id TEXT PRIMARY KEY,
        full_name TEXT,
        line1 TEXT,
        city TEXT,
        zip TEXT,
        country TEXT,
        phone TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
    // Talk2Me UNIVERSEL (Pascal 2026-08-06) : adresse MONDIALE — GPS socle (marche partout,
    // Mada comme le monde) + repère + label + ligne adresse LIBRE optionnelle. Additif.
    try { db.exec('ALTER TABLE shipping_addresses ADD COLUMN lat REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE shipping_addresses ADD COLUMN lng REAL'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE shipping_addresses ADD COLUMN landmark TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE shipping_addresses ADD COLUMN label TEXT'); } catch { /* déjà */ }
    // PAIEMENT PaPi/escrow de la course (Pascal 2026-07-17 : cash INTERDIT). escrow_id = séquestre
    // lié à la course ; paid = 1 quand le passager a lancé le paiement (chauffeur accepté).
    try { db.exec('ALTER TABLE rides ADD COLUMN escrow_id TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE rides ADD COLUMN paid INTEGER NOT NULL DEFAULT 0'); } catch { /* déjà */ }
    // Numéro de téléphone (optionnel) = clé de jointure répertoire (couche comm).
    try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT'); } catch { /* déjà */ }
    // Nom de groupe (conversations kind='group').
    try { db.exec('ALTER TABLE conversations ADD COLUMN name TEXT'); } catch { /* déjà */ }
    // Pays d'inscription (ANONYME : dérivé de l'IP à l'inscription, IP JAMAIS
    // stockée). Sert au dashboard "combien et où". Doctrine PII air-gap.
    try { db.exec('ALTER TABLE users ADD COLUMN country TEXT'); } catch { /* déjà */ }
    // Un produit (direct_card) peut appartenir à une boutique + une catégorie.
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN boutique_id TEXT'); } catch { /* déjà */ }
    try { db.exec('ALTER TABLE direct_cards ADD COLUMN category TEXT'); } catch { /* déjà */ }
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
  phone: string | null;
  avatar_url: string | null;
  ai_name: string | null;
  ai_avatar_url: string | null;
  ai_avatar_body_url: string | null;
  ai_avatar_video_url: string | null;
  streamoji_avatar_id: string | null;
  ai_gender: AiGender;
  room_photo: string | null;
  room_tagline: string | null;
  created_at: number;
  last_seen: number | null;
}

export interface CreateUserInput {
  /** Email OU phone requis (Mada-first : inscription par téléphone possible). */
  email?: string;
  phone?: string | null;
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
    phone: typeof row.phone === 'string' ? row.phone : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    ai_name:
      typeof row.ai_name === 'string' && row.ai_name.trim() !== ''
        ? row.ai_name
        : defaultAiName,
    ai_avatar_url:
      typeof row.ai_avatar_url === 'string' ? row.ai_avatar_url : null,
    ai_avatar_body_url:
      typeof row.ai_avatar_body_url === 'string' ? row.ai_avatar_body_url : null,
    ai_avatar_video_url:
      typeof row.ai_avatar_video_url === 'string' ? row.ai_avatar_video_url : null,
    streamoji_avatar_id:
      typeof row.streamoji_avatar_id === 'string' ? row.streamoji_avatar_id : null,
    ai_gender: normalizeAiGender(row.ai_gender),
    room_photo: typeof row.room_photo === 'string' ? row.room_photo : null,
    room_tagline: typeof row.room_tagline === 'string' ? row.room_tagline : null,
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
