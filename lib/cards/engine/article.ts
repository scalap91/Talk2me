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
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_articles (
      entity_ref TEXT PRIMARY KEY,
      body       TEXT NOT NULL DEFAULT '',
      version    INTEGER NOT NULL DEFAULT 1,
      lang       TEXT NOT NULL DEFAULT 'français',
      state      TEXT NOT NULL DEFAULT 'developing',
      updated_at INTEGER NOT NULL
    );
  `);
  // Migrations idempotentes (colonnes ajoutées sur une table existante).
  try {
    const cols = db.prepare('PRAGMA table_info(entity_articles)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'lang')) {
      db.exec("ALTER TABLE entity_articles ADD COLUMN lang TEXT NOT NULL DEFAULT 'français'");
    }
    if (!cols.some((c) => c.name === 'state')) {
      db.exec("ALTER TABLE entity_articles ADD COLUMN state TEXT NOT NULL DEFAULT 'developing'");
    }
  } catch {
    /* ignore */
  }
  ready = true;
}

/** Cycle de vie : ébauche/développement → mûr (barre haute) → figé (fermé, sauf événement neuf). */
export type ArticleState = 'developing' | 'mature' | 'frozen';

/** Force l'état d'un article (auto-maturité, gel admin, réouverture sur événement). */
export function setArticleState(entityRef: string, state: ArticleState): void {
  ensure();
  getDb().prepare('UPDATE entity_articles SET state = ? WHERE entity_ref = ?').run(state, entityRef);
}

/** Supprime l'article canonique (action modérateur) → la page retombe sur le contenu d'origine. */
export function deleteArticle(entityRef: string): void {
  ensure();
  getDb().prepare('DELETE FROM entity_articles WHERE entity_ref = ?').run(entityRef);
}

/** Corps canonique + version + langue + état, ou null. */
export function getArticleMeta(
  entityRef: string,
): { body: string; version: number; lang: string; state: ArticleState } | null {
  ensure();
  const row = getDb()
    .prepare('SELECT body, version, lang, state FROM entity_articles WHERE entity_ref = ?')
    .get(entityRef) as { body?: string; version?: number; lang?: string; state?: string } | undefined;
  const b = (row?.body || '').trim();
  if (!b) return null;
  const state = (['developing', 'mature', 'frozen'] as const).includes(row?.state as ArticleState)
    ? (row!.state as ArticleState)
    : 'developing';
  return { body: b, version: row?.version || 1, lang: row?.lang || 'français', state };
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

/** Écrit (ou remplace) le corps canonique + sa langue source. Incrémente la version. */
export function setArticle(entityRef: string, body: string, lang = 'français'): void {
  ensure();
  getDb()
    .prepare(
      `INSERT INTO entity_articles (entity_ref, body, version, lang, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(entity_ref) DO UPDATE SET
         body = excluded.body,
         version = entity_articles.version + 1,
         lang = excluded.lang,
         updated_at = excluded.updated_at`,
    )
    .run(entityRef, (body || '').trim(), lang, Date.now());
}
