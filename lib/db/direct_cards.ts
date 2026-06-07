// /lib/db/direct_cards.ts — Table direct_cards (Image/Vidéo/Texte créées
// via l'éditeur direct, hors clip de conversation).

import { randomUUID } from 'crypto';
import { getDb } from './_core';

export type DirectCardType = 'video' | 'image' | 'texte';

export interface DbDirectCard {
  id: string;
  user_id: string;
  type: DirectCardType;
  media_url: string | null;
  caption: string | null;
  text: string | null;
  bg_variant: string | null;
  created_at: number;
  likes: number;
  views: number;
  archived_at?: number | null;
  deleted_at?: number | null;
  share_count?: number;
  save_count?: number;
  comment_count?: number;
}

export interface CreateDirectCardInput {
  type: DirectCardType;
  media_url?: string | null;
  caption?: string | null;
  text?: string | null;
  bg_variant?: string | null;
}

export function parseDirectCardRow(row: any): DbDirectCard {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as DirectCardType,
    media_url: row.media_url ?? null,
    caption: row.caption ?? null,
    text: row.text ?? null,
    bg_variant: row.bg_variant ?? null,
    created_at: row.created_at,
    likes: row.likes ?? 0,
    views: row.views ?? 0,
    archived_at: typeof row.archived_at === 'number' ? row.archived_at : null,
    deleted_at: typeof row.deleted_at === 'number' ? row.deleted_at : null,
    share_count: row.share_count ?? 0,
    save_count: row.save_count ?? 0,
    comment_count: row.comment_count ?? 0,
  };
}

export function createDirectCard(
  userId: string,
  input: CreateDirectCardInput,
): DbDirectCard {
  if (!userId) throw new Error('userId required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    userId,
    input.type,
    input.media_url ?? null,
    input.caption ?? null,
    input.text ?? null,
    input.bg_variant ?? null,
    now
  );
  const row = db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(id) as any;
  return parseDirectCardRow(row);
}

export function getDirectCards(limit = 50, offset = 0): DbDirectCard[] {
  const db = getDb();
  // Lot A : exclut soft-deleted ET archivées du feed public.
  const rows = db
    .prepare(
      'SELECT * FROM direct_cards WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .all(limit, offset) as any[];
  return rows.map(parseDirectCardRow);
}
