/**
 * lib/db-tutorial — section « tutorial » extraite du monolithe lib/db.ts.
 *
 * SECTION TEST de la démonolithisation (#53, Pascal 2026-06-30). Méthode FAÇADE :
 * les fonctions vivent ici, mais lib/db.ts les RE-EXPORTE → les ~199 fichiers qui
 * font `import { getTutorial } from '@/lib/db'` continuent de marcher À L'IDENTIQUE.
 *
 * La connexion partagée vient de getDb() (lib/db.ts). La table `tutorial_steps`
 * reste créée par l'init de lib/db.ts (on ne déplace que les requêtes, pas le schéma).
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db-core';

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
export function getTutorial(topic: string): { topic: string; steps: TutorialStep[] } | null {
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
  db.prepare(`DELETE FROM tutorial_steps WHERE topic = ? AND step_order = ?`).run(step.topic, step.step_order);
  db.prepare(
    `INSERT INTO tutorial_steps (id, topic, step_order, title, body, media_url, next_action, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, step.topic, step.step_order, step.title, step.body, step.media_url ?? null, step.next_action ?? null, now);
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
