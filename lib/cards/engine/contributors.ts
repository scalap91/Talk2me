/**
 * core/card-engine — CONTRIBUTEURS d'une card (page-entité vivante, Pascal 2026-07-08).
 *
 * Quand un 2e user partage le MÊME contenu (même entity_key), il ne crée PAS de doublon :
 * il devient CONTRIBUTEUR de la card canonique. Chaque contribution reste ATTRIBUÉE
 * (le nom de Pascal, celui d'Alex…) — page collective, voix identifiées.
 * Sert plus tard la récompense (part sur ventes/valeur) et la réputation par entité.
 * Voir mémoire [[project_talk2me_page_entite_vivante]].
 */
import { getDb } from '@/lib/db';
import type { Database } from 'better-sqlite3';

export type ContributorRole = 'creator' | 'sharer' | 'editor';

export interface CardContributor {
  card_id: string;
  user_id: string;
  role: ContributorRole;
  joined_at: number;
}

let ensured = false;
function ensure(db: Database): void {
  if (ensured) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_contributors (
      card_id   TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'sharer',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (card_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_card_contrib_card ON card_contributors (card_id);
    CREATE INDEX IF NOT EXISTS idx_card_contrib_user ON card_contributors (user_id);
  `);
  ensured = true;
}
function db(): Database {
  const d = getDb();
  ensure(d);
  return d;
}

/**
 * Ajoute un contributeur (idempotent). Ne RÉTROGRADE jamais un 'creator' : si l'user
 * est déjà créateur, un ajout 'sharer' est ignoré. Retourne true si nouvelle ligne.
 */
export function addContributor(cardId: string, userId: string, role: ContributorRole = 'sharer'): boolean {
  if (!cardId || !userId) return false;
  const r = db()
    .prepare(
      `INSERT INTO card_contributors (card_id, user_id, role, joined_at)
         VALUES (?,?,?,?)
       ON CONFLICT(card_id, user_id) DO UPDATE SET
         role = CASE WHEN card_contributors.role = 'creator' THEN 'creator' ELSE excluded.role END`,
    )
    .run(cardId, userId, role, Date.now());
  return r.changes > 0;
}

/** Liste des contributeurs d'une card (créateur d'abord, puis par ancienneté). */
export function listContributors(cardId: string): CardContributor[] {
  return db()
    .prepare(
      `SELECT card_id, user_id, role, joined_at FROM card_contributors
         WHERE card_id = ?
         ORDER BY (role = 'creator') DESC, joined_at ASC`,
    )
    .all(cardId) as CardContributor[];
}

/** Nombre de contributeurs d'une card. */
export function contributorCount(cardId: string): number {
  const row = db().prepare('SELECT COUNT(*) AS c FROM card_contributors WHERE card_id = ?').get(cardId) as { c: number };
  return row?.c ?? 0;
}

/** Cet user est-il déjà contributeur de cette card ? */
export function isContributor(cardId: string, userId: string): boolean {
  return !!db().prepare('SELECT 1 FROM card_contributors WHERE card_id = ? AND user_id = ? LIMIT 1').get(cardId, userId);
}
