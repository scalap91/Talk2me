/**
 * Talk2Me #338 — Bootstrap : re-passe sur les messages historiques d'un user
 * pour pré-seed la table user_habits depuis les tool results déjà persistés
 * sur les messages (youtube, places, recipe, weather, etc.).
 *
 * Doctrine : non destructif, idempotent (upserts), aucune DeepSeek call.
 * Limité aux 90 derniers jours pour bornér le coût.
 *
 * Usage CLI :
 *   tsx /home/ubuntu/talktome/lib/scripts/bootstrap-habits.ts <userId>
 *   tsx /home/ubuntu/talktome/lib/scripts/bootstrap-habits.ts --all
 *
 * Usage lazy : appelable depuis un endpoint admin / au boot du process.
 */

import Database from 'better-sqlite3';
import path from 'path';
import {
  upsertUserHabit,
  getUserHabits,
  type UserHabitKind,
} from '@/lib/db';

const DB_PATH = process.cwd() + '/data/talktome.db';
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const MUSIC_GENRE_HINTS: Record<string, string> = {
  rap: 'rap',
  trap: 'rap',
  drill: 'rap',
  hiphop: 'rap',
  'hip-hop': 'rap',
  rock: 'rock',
  metal: 'metal',
  pop: 'pop',
  jazz: 'jazz',
  classique: 'classical',
  electro: 'electronic',
  edm: 'electronic',
  house: 'electronic',
  techno: 'electronic',
  reggae: 'reggae',
  rai: 'rai',
  raï: 'rai',
  rnb: 'rnb',
  soul: 'soul',
};

function detectGenre(title: string, channel: string): string | null {
  const hay = `${title} ${channel}`.toLowerCase();
  for (const [needle, genre] of Object.entries(MUSIC_GENRE_HINTS)) {
    if (hay.includes(needle)) return genre;
  }
  return null;
}

function cleanChannelToArtist(channel: string): string {
  return channel
    .replace(/\b(VEVO|Official|Music|Records|Channel|TV)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawRow {
  message_id: string;
  conversation_id: string;
  conv_user_id: string;
  youtube: string | null;
  places: string | null;
  recipe: string | null;
  weather: string | null;
  intent_query: string | null;
  created_at: number;
}

export interface BootstrapResult {
  user_id: string;
  rows_scanned: number;
  habits_upserted: number;
}

/**
 * Bootstrap un user spécifique. Idempotent (upsert).
 */
export function bootstrapHabitsForUser(userId: string): BootstrapResult {
  const db = new Database(DB_PATH, { readonly: true });
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const rows = db
    .prepare(
      `SELECT m.id AS message_id, m.conversation_id, c.user_id AS conv_user_id,
              m.youtube, m.places, m.recipe, m.weather, m.intent_query,
              m.created_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = ?
           AND m.role = 'agent'
           AND m.created_at >= ?
         ORDER BY m.created_at ASC`,
    )
    .all(userId, cutoff) as RawRow[];
  db.close();

  let upserts = 0;
  function bump(kind: UserHabitKind, value: string) {
    const r = upsertUserHabit(userId, kind, value, 'bootstrap');
    if (r) upserts++;
  }

  for (const row of rows) {
    // YouTube
    if (row.youtube) {
      try {
        const yt = JSON.parse(row.youtube);
        if (yt && typeof yt.channel === 'string') {
          const artist = cleanChannelToArtist(yt.channel);
          if (artist) bump('music_artist', artist);
          const genre = detectGenre(
            typeof yt.title === 'string' ? yt.title : '',
            yt.channel,
          );
          if (genre) bump('music_genre', genre);
        }
      } catch {
        // ignore
      }
    }
    // Places (cuisines détectées sur les vrais places)
    if (row.places) {
      try {
        const list = JSON.parse(row.places);
        if (Array.isArray(list)) {
          const cuisines = new Set<string>();
          for (const p of list.slice(0, 6)) {
            if (p && typeof p.cuisine === 'string' && p.cuisine.trim()) {
              for (const c of p.cuisine.split(/[;,]+/)) {
                const cc = c.trim().toLowerCase();
                if (cc && cc.length <= 40) cuisines.add(cc);
              }
            }
          }
          for (const c of Array.from(cuisines).slice(0, 2)) {
            bump('food_pref', c);
          }
        }
      } catch {
        // ignore
      }
    }
    // Recipe
    if (row.recipe) {
      try {
        const r = JSON.parse(row.recipe);
        if (r && typeof r.name === 'string') {
          bump('food_pref', r.name.trim().toLowerCase());
        }
      } catch {
        // ignore
      }
    }
    // Weather
    if (row.weather) {
      try {
        const w = JSON.parse(row.weather);
        if (w && typeof w.place_label === 'string' && w.place_label.trim()) {
          bump('place_visited', w.place_label.trim());
        }
      } catch {
        // ignore
      }
    }
    // intent_query (utile pour topic récurrent)
    if (row.intent_query && row.intent_query.length <= 60) {
      bump('topic', row.intent_query.toLowerCase());
    }
  }

  return {
    user_id: userId,
    rows_scanned: rows.length,
    habits_upserted: upserts,
  };
}

/**
 * Bootstrap LAZY : si le user n'a aucune habit en table, lance le bootstrap.
 * Sinon no-op. Sûr à appeler à chaque requête.
 */
export function maybeBootstrapHabits(userId: string): BootstrapResult | null {
  if (!userId) return null;
  const existing = getUserHabits(userId, undefined, 1);
  if (existing.length > 0) return null;
  try {
    return bootstrapHabitsForUser(userId);
  } catch (e) {
    console.warn('[bootstrap-habits] error', (e as Error).message);
    return null;
  }
}

/**
 * Bootstrap tous les users (CLI --all).
 */
export function bootstrapAllUsers(): BootstrapResult[] {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare('SELECT id FROM users WHERE id IS NOT NULL')
    .all() as Array<{ id: string }>;
  db.close();
  const out: BootstrapResult[] = [];
  for (const r of rows) {
    out.push(bootstrapHabitsForUser(r.id));
  }
  return out;
}

// === CLI ===
if (typeof require !== 'undefined' && require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx bootstrap-habits.ts <userId> | --all');
    process.exit(1);
  }
  const t0 = Date.now();
  if (arg === '--all') {
    const all = bootstrapAllUsers();
    console.log(JSON.stringify(all, null, 2));
    console.log(
      `[bootstrap-habits] ${all.length} users, ${Date.now() - t0}ms`,
    );
  } else {
    const r = bootstrapHabitsForUser(arg);
    console.log(JSON.stringify(r, null, 2));
    console.log(`[bootstrap-habits] done in ${Date.now() - t0}ms`);
  }
}

const __sentinel = 0;
export default __sentinel;
