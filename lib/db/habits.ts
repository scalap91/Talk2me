// /lib/db/habits.ts — User habits (apprentissage passif des préférences).
// Doctrine [[talk2me-roadmap-6-phases]] Phase 1.

import { randomUUID } from 'crypto';
import { getDb } from './_core';

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
