/**
 * Talk2Me — ARTICLE CANONIQUE d'une entité (page-entité vivante, M1, Pascal 2026-07-08).
 * Un SEUL corps d'article par entité (clé = entityRef). Léa le RÉÉCRIT à chaque
 * contribution acceptée (fusion), au lieu d'empiler des blocs. Doctrine Onyx
 * [[project_onyx_semantic_engine]] : l'article grandit en QUALITÉ, pas en volume.
 */
import { getDb } from '@/lib/db';

let ready = false;
function ensure(): void {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS entity_articles (
      entity_ref TEXT PRIMARY KEY,
      body       TEXT NOT NULL DEFAULT '',
      version    INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
  `);
  ready = true;
}

/** Corps canonique de l'entité, ou null s'il n'a jamais été fusionné. */
export function getArticle(entityRef: string): string | null {
  ensure();
  const row = getDb()
    .prepare('SELECT body FROM entity_articles WHERE entity_ref = ?')
    .get(entityRef) as { body?: string } | undefined;
  const b = (row?.body || '').trim();
  return b || null;
}

/** Écrit (ou remplace) le corps canonique. Incrémente la version. */
export function setArticle(entityRef: string, body: string): void {
  ensure();
  getDb()
    .prepare(
      `INSERT INTO entity_articles (entity_ref, body, version, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(entity_ref) DO UPDATE SET
         body = excluded.body,
         version = entity_articles.version + 1,
         updated_at = excluded.updated_at`,
    )
    .run(entityRef, (body || '').trim(), Date.now());
}
