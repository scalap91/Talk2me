/**
 * core/card-engine — SCHÉMA du STORE unique de Cards (Phase 0, vision Card OS).
 * Spéc dirigée par Gemini (reviews/_SPEC-PHASE0.md). Strangler : cette table + ce
 * moteur vivent À CÔTÉ de l'existant ; RIEN n'est branché à l'app à ce stade.
 * SQLite (better-sqlite3, synchrone) : le JSON complet de la SuperCard est stocké
 * en TEXT (`card_data`) ; quelques colonnes sont dénormalisées pour l'index.
 */
import type { Database } from 'better-sqlite3';
import type { SuperCard, CardChannel } from '@/lib/cards/supercard';

/** Représentation d'une SuperCard telle que stockée dans la table `cards`. */
export interface DbCardRow {
  id: string;
  owner: string;
  title: string;
  types: string;        // JSON string de CardType[]
  channel: string | null;
  state: string;        // 'draft' | 'published' | 'archived'
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  card_data: string;    // JSON complet de la SuperCard
}

// Crée la table une seule fois par process (idempotent — CREATE IF NOT EXISTS).
let ensured = false;
export function ensureCardsTable(db: Database): void {
  if (ensured) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id         TEXT PRIMARY KEY NOT NULL,
      owner      TEXT NOT NULL,
      title      TEXT NOT NULL,
      types      TEXT NOT NULL,
      channel    TEXT,
      state      TEXT NOT NULL DEFAULT 'published',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      card_data  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_owner      ON cards (owner);
    CREATE INDEX IF NOT EXISTS idx_cards_state      ON cards (state);
    CREATE INDEX IF NOT EXISTS idx_cards_channel    ON cards (channel);
    CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards (created_at);
    CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards (deleted_at);
    CREATE INDEX IF NOT EXISTS idx_cards_types      ON cards (types);
  `);
  ensured = true;
}

/** SuperCard → ligne DB (dénormalise les colonnes indexées, sérialise le reste). */
export function superCardToDbRow(card: SuperCard): Omit<DbCardRow, 'deleted_at'> {
  const now = Date.now();
  return {
    id: card.id,
    owner: card.owner || 'system',
    title: card.title,
    types: JSON.stringify(card.types),
    channel: card.channel ?? null,
    state: card.state || 'published',
    created_at: card.createdAt || now,
    updated_at: card.updatedAt || now,
    card_data: JSON.stringify(card),
  };
}

/** Ligne DB → SuperCard (source de vérité = card_data ; colonnes resynchronisées). */
export function dbRowToSuperCard(row: DbCardRow): SuperCard {
  const card = JSON.parse(row.card_data) as SuperCard;
  card.id = row.id;
  card.owner = row.owner;
  card.title = row.title;
  card.types = JSON.parse(row.types);
  card.channel = row.channel === null ? undefined : (row.channel as CardChannel);
  card.state = row.state as SuperCard['state'];
  card.createdAt = row.created_at;
  card.updatedAt = row.updated_at;
  return card;
}
