/**
 * Talk2Me — COMMENTAIRES de cards/posts (Pascal 2026-06-24). Style TikTok :
 * à l'ouverture le post rétrécit, le panneau commentaires prend le bas (mobile)
 * ou la gauche (desktop). Module isolé : table auto-créée, fonctions sur getDb().
 * PII air-gap : on ne sort que username/display_name/avatar. Soft-delete.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export type CommentCardKind = 'direct_card' | 'post';

export interface CommentItem {
  id: string;
  body: string;
  created_at: number;
  is_mine: boolean;
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

let _init = false;
function ensure() {
  if (_init) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_comments (
      id TEXT PRIMARY KEY,
      card_kind TEXT NOT NULL,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_card_comments_card ON card_comments(card_kind, card_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_card_comments_user ON card_comments(user_id, created_at DESC);
  `);
  _init = true;
}

const TABLE: Record<CommentCardKind, string> = { direct_card: 'direct_cards', post: 'posts' };

function syncCount(db: ReturnType<typeof getDb>, kind: CommentCardKind, cardId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM card_comments WHERE card_kind = ? AND card_id = ? AND deleted_at IS NULL')
    .get(kind, cardId) as { c: number };
  const n = row?.c ?? 0;
  try { db.prepare(`UPDATE ${TABLE[kind]} SET comment_count = ? WHERE id = ?`).run(n, cardId); } catch { /* colonne absente */ }
  return n;
}

function cardExists(db: ReturnType<typeof getDb>, kind: CommentCardKind, cardId: string): boolean {
  try { return !!db.prepare(`SELECT id FROM ${TABLE[kind]} WHERE id = ? AND deleted_at IS NULL`).get(cardId); }
  catch { return false; }
}

export function addComment(userId: string, kind: CommentCardKind, cardId: string, body: string):
  { id: string; count: number; created_at: number } | null {
  ensure();
  const text = (body || '').trim().slice(0, 2000);
  if (!text) return null;
  const db = getDb();
  if (!cardExists(db, kind, cardId)) return null;
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO card_comments (id, card_kind, card_id, user_id, body, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, kind, cardId, userId, text, now);
  const count = syncCount(db, kind, cardId);
  return { id, count, created_at: now };
}

export function listComments(kind: CommentCardKind, cardId: string, meId: string | null, limit = 300): CommentItem[] {
  ensure();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.username, u.display_name, u.avatar_url
         FROM card_comments c JOIN users u ON u.id = c.user_id
        WHERE c.card_kind = ? AND c.card_id = ? AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC LIMIT ?`,
    )
    .all(kind, cardId, limit) as Array<{
      id: string; body: string; created_at: number; user_id: string;
      username: string; display_name: string | null; avatar_url: string | null;
    }>;
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    is_mine: !!meId && r.user_id === meId,
    user: { id: r.user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url },
  }));
}

export function commentCount(kind: CommentCardKind, cardId: string): number {
  ensure();
  return syncCount(getDb(), kind, cardId);
}

export function deleteComment(userId: string, commentId: string): { count: number } | null {
  ensure();
  const db = getDb();
  const row = db.prepare('SELECT * FROM card_comments WHERE id = ? AND deleted_at IS NULL').get(commentId) as
    | { id: string; user_id: string; card_kind: CommentCardKind; card_id: string } | undefined;
  if (!row || row.user_id !== userId) return null;
  db.prepare('UPDATE card_comments SET deleted_at = ? WHERE id = ?').run(Date.now(), commentId);
  return { count: syncCount(db, row.card_kind, row.card_id) };
}
