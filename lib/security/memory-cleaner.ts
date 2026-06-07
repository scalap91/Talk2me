/**
 * Talk2Me PII air-gap Layer 6 (Pascal 2026-06-05) — Memory cleaner background.
 *
 * Doctrine [[talk2me-pii-air-gap]] verbatim Pascal :
 *   "il dois refuser de la transmetre et dois lefacer en memoire"
 *
 * Scanne user_habits + ai_memories d'un user, supprime toute ligne dont la
 * value contient un pattern PII. Idempotent : un appel répété ne fait rien
 * si déjà clean.
 *
 * Throttle 24h via colonne users.last_pii_clean_at (ajoutée par migration
 * idempotente). Appelé depuis /api/auth/me — fail-soft, jamais bloquant.
 */

import { getDb } from '@/lib/db';
import { containsPii } from './pii';

export interface CleanResult {
  habits_deleted: number;
  memories_deleted: number;
  ran: boolean;
}

/**
 * Scanne user_habits + ai_memories du user, supprime les lignes PII.
 * Retourne le compte. NE FAIT PAS le throttle 24h (responsabilité du caller).
 */
export function cleanUserMemoryPii(userId: string): CleanResult {
  if (!userId) return { habits_deleted: 0, memories_deleted: 0, ran: false };
  const db = getDb();
  let habitsDeleted = 0;
  let memoriesDeleted = 0;

  try {
    const habits = db
      .prepare('SELECT id, value FROM user_habits WHERE user_id = ?')
      .all(userId) as Array<{ id: string; value: string }>;
    for (const h of habits) {
      if (containsPii(h.value)) {
        db.prepare('DELETE FROM user_habits WHERE id = ?').run(h.id);
        habitsDeleted++;
      }
    }
  } catch (e) {
    console.warn('[pii-cleaner] habits scan error', e);
  }

  try {
    const memories = db
      .prepare('SELECT id, content FROM ai_memories WHERE user_id = ?')
      .all(userId) as Array<{ id: string; content: string }>;
    for (const m of memories) {
      if (containsPii(m.content)) {
        db.prepare('DELETE FROM ai_memories WHERE id = ?').run(m.id);
        memoriesDeleted++;
      }
    }
  } catch (e) {
    console.warn('[pii-cleaner] memories scan error', e);
  }

  if (habitsDeleted > 0 || memoriesDeleted > 0) {
    console.warn(
      '[pii-cleaner] purged PII',
      `userId=${userId}`,
      `habits=${habitsDeleted}`,
      `memories=${memoriesDeleted}`,
    );
  }

  return { habits_deleted: habitsDeleted, memories_deleted: memoriesDeleted, ran: true };
}

const PII_CLEAN_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Throttled : ne lance le scan que si dernière exécution > 24h.
 * Idempotent, jamais bloquant. À appeler depuis /api/auth/me.
 */
export function maybeCleanUserMemoryPii(userId: string): CleanResult {
  if (!userId) return { habits_deleted: 0, memories_deleted: 0, ran: false };
  const db = getDb();
  try {
    const row = db
      .prepare('SELECT last_pii_clean_at FROM users WHERE id = ?')
      .get(userId) as { last_pii_clean_at?: number } | undefined;
    const last =
      typeof row?.last_pii_clean_at === 'number' ? row.last_pii_clean_at : 0;
    if (Date.now() - last < PII_CLEAN_THROTTLE_MS) {
      return { habits_deleted: 0, memories_deleted: 0, ran: false };
    }
    const result = cleanUserMemoryPii(userId);
    db.prepare('UPDATE users SET last_pii_clean_at = ? WHERE id = ?').run(
      Date.now(),
      userId,
    );
    return result;
  } catch (e) {
    console.warn('[pii-cleaner] maybeClean skipped', e);
    return { habits_deleted: 0, memories_deleted: 0, ran: false };
  }
}
