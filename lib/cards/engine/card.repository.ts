/**
 * core/card-engine — REPOSITORY : CRUD bas niveau sur la table `cards` (SQLite).
 * Spéc Gemini (reviews/_SPEC-PHASE0.md). Synchrone (better-sqlite3). La table est
 * créée en lazy (ensureCardsTable) → aucun fichier existant n'est modifié.
 */
import { getDb } from '@/lib/db';
import type { SuperCard } from '@/lib/cards/supercard';
import { ensureCardsTable, superCardToDbRow, dbRowToSuperCard, type DbCardRow } from './schema';

function db() {
  const d = getDb();
  ensureCardsTable(d);
  return d;
}

/** Filtres de recherche (Phase 0 minimal ; s'enrichira aux phases suivantes). */
export interface CardFilters {
  owner?: string;
  channel?: string;
  type?: string;               // un CardType présent dans le tableau types
  state?: string;              // défaut : exclut les archivées/supprimées
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export const cardRepository = {
  findById(id: string): SuperCard | null {
    const row = db().prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbCardRow | undefined;
    return row ? dbRowToSuperCard(row) : null;
  },

  save(card: SuperCard): SuperCard {
    const d = db();
    const row = superCardToDbRow({ ...card, updatedAt: Date.now() });
    const exists = d.prepare('SELECT 1 FROM cards WHERE id = ?').get(card.id);
    if (exists) {
      d.prepare(`UPDATE cards SET owner=?, title=?, types=?, channel=?, state=?, updated_at=?, card_data=? WHERE id=?`)
        .run(row.owner, row.title, row.types, row.channel, row.state, row.updated_at, row.card_data, row.id);
    } else {
      d.prepare(`INSERT INTO cards (id, owner, title, types, channel, state, created_at, updated_at, card_data) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(row.id, row.owner, row.title, row.types, row.channel, row.state, row.created_at, row.updated_at, row.card_data);
    }
    return this.findById(card.id)!;
  },

  softDelete(id: string): boolean {
    const r = db().prepare(`UPDATE cards SET deleted_at=?, state='archived', updated_at=? WHERE id=? AND deleted_at IS NULL`)
      .run(Date.now(), Date.now(), id);
    return r.changes > 0;
  },

  restore(id: string): boolean {
    const r = db().prepare(`UPDATE cards SET deleted_at=NULL, state='published', updated_at=? WHERE id=? AND deleted_at IS NOT NULL`)
      .run(Date.now(), id);
    return r.changes > 0;
  },

  query(filters: CardFilters = {}): SuperCard[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (!filters.includeDeleted) where.push('deleted_at IS NULL');
    if (filters.owner) { where.push('owner = ?'); params.push(filters.owner); }
    if (filters.channel) { where.push('channel = ?'); params.push(filters.channel); }
    if (filters.state) { where.push('state = ?'); params.push(filters.state); }
    if (filters.type) { where.push('types LIKE ?'); params.push(`%"${filters.type}"%`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    const rows = db().prepare(`SELECT * FROM cards ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as DbCardRow[];
    return rows.map(dbRowToSuperCard);
  },
};
