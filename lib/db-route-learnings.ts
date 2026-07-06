/**
 * lib/db-route-learnings — section « route_learnings » (apprentissage per-user des
 * chaînes d'outils, #340) extraite du monolithe lib/db.ts (façade #53, Pascal
 * 2026-06-30). lib/db.ts re-exporte → appelants inchangés. Connexion = getDb().
 * Table route_learnings toujours créée par l'init de lib/db.ts.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db-core';

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
 * Score clamp : [-2, 2].
 */
export function logRouteAttempt(userId: string, intent: string, toolChain: string[], scoreDelta: number): void {
  if (!userId || !intent || !Array.isArray(toolChain)) return;
  const chainStr = JSON.stringify(toolChain);
  const now = Date.now();
  const db = getDb();
  try {
    const existing = db
      .prepare('SELECT id, success_score, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? AND tool_chain = ?')
      .get(userId, intent, chainStr) as { id: string; success_score: number; occurrences: number } | undefined;
    if (existing) {
      const newScore = Math.max(-2, Math.min(2, (existing.success_score || 0) + scoreDelta));
      db.prepare('UPDATE route_learnings SET success_score = ?, last_used_at = ?, occurrences = occurrences + 1 WHERE id = ?').run(newScore, now, existing.id);
    } else {
      const id = randomUUID();
      db.prepare('INSERT INTO route_learnings (id, user_id, intent, tool_chain, success_score, last_used_at, occurrences) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, userId, intent, chainStr, scoreDelta, now);
    }
  } catch (e) {
    console.error('[db] logRouteAttempt error', e);
  }
}

/** Renvoie la chaîne de tools préférée pour ce (user, intent), ou null. */
export function getPreferredRoute(userId: string, intent: string): DbRouteLearning | null {
  if (!userId || !intent) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT id, user_id, intent, tool_chain, success_score, last_used_at, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? ORDER BY success_score DESC, last_used_at DESC LIMIT 1')
    .get(userId, intent) as { id: string; user_id: string; intent: string; tool_chain: string; success_score: number; last_used_at: number; occurrences: number } | undefined;
  if (!row) return null;
  let chain: string[] = [];
  try {
    const parsed = JSON.parse(row.tool_chain);
    if (Array.isArray(parsed)) chain = parsed.filter((x) => typeof x === 'string');
  } catch { /* ignore corrupted row */ }
  return { id: row.id, user_id: row.user_id, intent: row.intent, tool_chain: chain, success_score: row.success_score, last_used_at: row.last_used_at, occurrences: row.occurrences };
}

/** Renvoie les N routes les mieux scorées pour ce (user, intent). */
export function getRouteFallbacks(userId: string, intent: string, limit = 3): DbRouteLearning[] {
  if (!userId || !intent) return [];
  const db = getDb();
  const rows = db
    .prepare('SELECT id, user_id, intent, tool_chain, success_score, last_used_at, occurrences FROM route_learnings WHERE user_id = ? AND intent = ? ORDER BY success_score DESC, last_used_at DESC LIMIT ?')
    .all(userId, intent, limit) as Array<{ id: string; user_id: string; intent: string; tool_chain: string; success_score: number; last_used_at: number; occurrences: number }>;
  return rows.map((r) => {
    let chain: string[] = [];
    try {
      const parsed = JSON.parse(r.tool_chain);
      if (Array.isArray(parsed)) chain = parsed.filter((x) => typeof x === 'string');
    } catch { /* ignore */ }
    return { id: r.id, user_id: r.user_id, intent: r.intent, tool_chain: chain, success_score: r.success_score, last_used_at: r.last_used_at, occurrences: r.occurrences };
  });
}
