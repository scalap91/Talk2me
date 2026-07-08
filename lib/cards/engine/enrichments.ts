/**
 * core/card-engine — ENRICHISSEMENTS d'une card (page-entité vivante, Pascal 2026-07-08).
 *
 * Un contributeur « enrichit » un post : il ajoute CE QU'IL SAIT EN PLUS. Chaque
 * enrichissement reste ATTRIBUÉ (user_id) — la page collective garde des voix
 * identifiées. Léa reformule la FORME (orthographe, clarté), jamais le FOND :
 * les faits ajoutés viennent de l'humain, pas de l'IA. Voir doctrine
 * [[project_talk2me_page_entite_vivante]] et [[feedback_content_grounding]].
 */
import { getDb } from '@/lib/db';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface CardEnrichment {
  id: string;
  card_id: string;
  user_id: string;
  text: string;
  created_at: number;
}

let ensured = false;
function ensure(db: Database): void {
  if (ensured) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_enrichments (
      id         TEXT PRIMARY KEY,
      card_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_enrich_card ON card_enrichments (card_id);
  `);
  ensured = true;
}
function db(): Database {
  const d = getDb();
  ensure(d);
  return d;
}

/** Ajoute un enrichissement attribué. Retourne l'id créé, ou null si vide. */
export function addEnrichment(cardId: string, userId: string, text: string): string | null {
  const body = (text || '').trim();
  if (!cardId || !userId || !body) return null;
  const id = randomUUID();
  db()
    .prepare('INSERT INTO card_enrichments (id, card_id, user_id, text, created_at) VALUES (?,?,?,?,?)')
    .run(id, cardId, userId, body, Date.now());
  return id;
}

/** Liste des enrichissements d'une card (le plus récent en DERNIER). */
export function listEnrichments(cardId: string): CardEnrichment[] {
  return db()
    .prepare('SELECT id, card_id, user_id, text, created_at FROM card_enrichments WHERE card_id = ? ORDER BY created_at ASC')
    .all(cardId) as CardEnrichment[];
}
