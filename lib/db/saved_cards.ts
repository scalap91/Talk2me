// /lib/db/saved_cards.ts — Cards réutilisables sauvegardées par l'user
// (bookmarks). Doctrine [[talktome-conversation-avant-recherche]].

import { randomUUID } from 'crypto';
import { getDb } from './_core';

export type SavedCardKind =
  | 'youtube'
  | 'place'
  | 'recipe'
  | 'wikipedia'
  | 'weather'
  | 'product'
  | 'web_search'
  | 'video_card'
  | 'image_card'
  | 'texte_card';

export interface DbSavedCard {
  id: string;
  user_id: string;
  source_message_id: string | null;
  source_conv_id: string | null;
  card_kind: SavedCardKind;
  card_data: unknown; // JSON parsed
  title: string | null;
  note: string | null;
  saved_at: number;
}

function parseSavedCardRow(row: any): DbSavedCard {
  let data: unknown = null;
  try {
    data = row.card_data ? JSON.parse(row.card_data) : null;
  } catch {
    data = null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    source_message_id: typeof row.source_message_id === 'string' ? row.source_message_id : null,
    source_conv_id: typeof row.source_conv_id === 'string' ? row.source_conv_id : null,
    card_kind: row.card_kind as SavedCardKind,
    card_data: data,
    title: typeof row.title === 'string' ? row.title : null,
    note: typeof row.note === 'string' ? row.note : null,
    saved_at: row.saved_at,
  };
}

export function saveCard(args: {
  userId: string;
  cardKind: SavedCardKind;
  cardData: unknown;
  sourceMessageId?: string | null;
  sourceConvId?: string | null;
  title?: string | null;
  note?: string | null;
}): DbSavedCard {
  const userId = (args.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  if (!args.cardKind) throw new Error('card_kind_required');
  if (args.cardData === undefined || args.cardData === null) {
    throw new Error('card_data_required');
  }
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const dataJson = JSON.stringify(args.cardData);
  if (dataJson.length > 200_000) throw new Error('card_too_large');
  db.prepare(
    'INSERT INTO saved_cards (id, user_id, source_message_id, source_conv_id, card_kind, card_data, title, note, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    userId,
    args.sourceMessageId ?? null,
    args.sourceConvId ?? null,
    args.cardKind,
    dataJson,
    args.title ?? null,
    args.note ?? null,
    now
  );
  const row = db.prepare('SELECT * FROM saved_cards WHERE id = ?').get(id) as any;
  return parseSavedCardRow(row);
}

export function getSavedCards(
  userId: string,
  limit: number = 50,
  offset: number = 0
): DbSavedCard[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  const rows = db
    .prepare(
      'SELECT * FROM saved_cards WHERE user_id = ? ORDER BY saved_at DESC LIMIT ? OFFSET ?'
    )
    .all(userId, n, off) as any[];
  return rows.map(parseSavedCardRow);
}

export function getSavedCardById(userId: string, cardId: string): DbSavedCard | null {
  if (!userId || !cardId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM saved_cards WHERE id = ? AND user_id = ?')
    .get(cardId, userId) as any;
  return row ? parseSavedCardRow(row) : null;
}

export function deleteSavedCard(userId: string, cardId: string): boolean {
  if (!userId || !cardId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM saved_cards WHERE id = ? AND user_id = ?')
    .run(cardId, userId);
  return r.changes > 0;
}

export function updateSavedCard(
  userId: string,
  cardId: string,
  patch: { title?: string | null; note?: string | null; cardData?: unknown }
): DbSavedCard | null {
  if (!userId || !cardId) return null;
  const existing = getSavedCardById(userId, cardId);
  if (!existing) return null;
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    vals.push(patch.title);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    vals.push(patch.note);
  }
  if (patch.cardData !== undefined) {
    sets.push('card_data = ?');
    vals.push(JSON.stringify(patch.cardData));
  }
  if (sets.length === 0) return existing;
  vals.push(cardId, userId);
  db.prepare(`UPDATE saved_cards SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(
    ...vals
  );
  return getSavedCardById(userId, cardId);
}
