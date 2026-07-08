/**
 * Talk2Me — NOTE LECTEUR + SIGNALEMENT (page-entité vivante, M3, Pascal 2026-07-08).
 * Le public évalue la FIABILITÉ d'un article (👍 fiable / 👎 douteux) et peut le SIGNALER.
 * C'est la couche « contrôler la merde » côté lecteur : un article mal noté ou signalé
 * remonte en révision (→ modération M4). Clés par entityRef (comme contributeurs/enrich).
 */
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

let ready = false;
function ensure(): void {
  if (ready) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_ratings (
      entity_ref TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      value      INTEGER NOT NULL,   -- 1 = fiable, -1 = douteux
      created_at INTEGER NOT NULL,
      PRIMARY KEY (entity_ref, user_id)
    );
    CREATE TABLE IF NOT EXISTS entity_reports (
      id         TEXT PRIMARY KEY,
      entity_ref TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      reason     TEXT NOT NULL,
      note       TEXT,
      status     TEXT NOT NULL DEFAULT 'open',  -- open | reviewed | dismissed
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entity_reports_ref ON entity_reports(entity_ref, status);
  `);
  ready = true;
}

export interface RatingSummary {
  fiable: number;
  douteux: number;
  total: number;
  score: number; // 0-100 : part de « fiable »
  myVote: 0 | 1 | -1;
  reports: number; // signalements ouverts
  flagged: boolean; // remonté pour révision ?
}

/** Vote fiabilité (upsert). value: 1 (fiable) ou -1 (douteux). 0 = retire le vote. */
export function rateEntity(entityRef: string, userId: string, value: 1 | -1 | 0): void {
  ensure();
  const db = getDb();
  if (value === 0) {
    db.prepare('DELETE FROM entity_ratings WHERE entity_ref = ? AND user_id = ?').run(entityRef, userId);
    return;
  }
  db.prepare(
    `INSERT INTO entity_ratings (entity_ref, user_id, value, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(entity_ref, user_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
  ).run(entityRef, userId, value, Date.now());
}

/** Enregistre un signalement. reason court (faux/spam/offensant/autre) + note optionnelle. */
export function reportEntity(entityRef: string, userId: string, reason: string, note: string): string {
  ensure();
  const id = `rep_${randomUUID()}`;
  getDb()
    .prepare(
      `INSERT INTO entity_reports (id, entity_ref, user_id, reason, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    )
    .run(id, entityRef, userId, reason.slice(0, 40), (note || '').slice(0, 500), Date.now());
  return id;
}

/** Résumé de fiabilité + signalements pour une entité. */
export function getRatingSummary(entityRef: string, userId?: string): RatingSummary {
  ensure();
  const db = getDb();
  const rows = db
    .prepare('SELECT value, COUNT(*) as n FROM entity_ratings WHERE entity_ref = ? GROUP BY value')
    .all(entityRef) as { value: number; n: number }[];
  let fiable = 0;
  let douteux = 0;
  for (const r of rows) {
    if (r.value === 1) fiable = r.n;
    else if (r.value === -1) douteux = r.n;
  }
  const total = fiable + douteux;
  const score = total > 0 ? Math.round((100 * fiable) / total) : 0;
  const reports = (
    db.prepare("SELECT COUNT(*) as n FROM entity_reports WHERE entity_ref = ? AND status = 'open'").get(entityRef) as {
      n: number;
    }
  ).n;
  let myVote: 0 | 1 | -1 = 0;
  if (userId) {
    const mine = db
      .prepare('SELECT value FROM entity_ratings WHERE entity_ref = ? AND user_id = ?')
      .get(entityRef, userId) as { value?: number } | undefined;
    myVote = mine?.value === 1 ? 1 : mine?.value === -1 ? -1 : 0;
  }
  // Remonté en révision : assez de votes et majorité « douteux », OU ≥ 3 signalements.
  const flagged = (total >= 4 && score < 40) || reports >= 3;
  return { fiable, douteux, total, score, myVote, reports, flagged };
}
