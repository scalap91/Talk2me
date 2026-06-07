// /lib/db/legal.ts — Legal docs (T2M Officiel IA institutionnelle).
// Doctrine [[talk2me-officiel-ia]].

import { getDb } from './_core';

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
