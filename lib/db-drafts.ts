/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-drafts — section « drafts » (brouillons de cards) extraite du monolithe
 * lib/db.ts (façade #53 démonolithisation, Pascal 2026-06-30). lib/db.ts re-exporte
 * ce module → les appelants `import { saveDraft } from '@/lib/db'` ne changent rien.
 * Connexion partagée = getDb(). Table card_drafts toujours créée par l'init de lib/db.ts.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db-core';

export type CardDraftType = 'image' | 'video' | 'texte' | 'gabarit' | 'plat_maison' | 'resto' | 'boutique';

export interface DbCardDraft {
  id: string;
  user_id: string;
  type: CardDraftType;
  draft_data: unknown; // JSON parsed
  thumbnail_url: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

function parseCardDraftRow(row: any): DbCardDraft {
  let data: unknown = null;
  try {
    data = row.draft_data ? JSON.parse(row.draft_data) : null;
  } catch {
    data = null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as CardDraftType,
    draft_data: data,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    title: typeof row.title === 'string' ? row.title : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Upsert d'un brouillon. Si id fourni et appartient au user → update.
 * Sinon → insert (avec id généré ou id fourni).
 */
export function saveDraft(args: {
  id?: string | null;
  userId: string;
  type: CardDraftType;
  draftData: unknown;
  thumbnailUrl?: string | null;
  title?: string | null;
}): DbCardDraft {
  const userId = (args.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  if (!args.type) throw new Error('type_required');
  if (!['image', 'video', 'texte', 'gabarit', 'plat_maison', 'resto', 'boutique'].includes(args.type)) {
    throw new Error('type_invalid');
  }
  if (args.draftData === undefined || args.draftData === null) {
    throw new Error('draft_data_required');
  }
  const db = getDb();
  const now = Date.now();
  const dataJson = JSON.stringify(args.draftData);
  if (dataJson.length > 500_000) throw new Error('draft_too_large');

  // Si id fourni → tentative d'update
  if (args.id) {
    const existing = db
      .prepare('SELECT id FROM card_drafts WHERE id = ? AND user_id = ?')
      .get(args.id, userId) as { id?: string } | undefined;
    if (existing?.id) {
      db.prepare(
        `UPDATE card_drafts
           SET type = ?, draft_data = ?, thumbnail_url = ?, title = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
      ).run(args.type, dataJson, args.thumbnailUrl ?? null, args.title ?? null, now, args.id, userId);
      const row = db.prepare('SELECT * FROM card_drafts WHERE id = ?').get(args.id) as any;
      return parseCardDraftRow(row);
    }
  }

  const id = args.id || randomUUID();
  db.prepare(
    `INSERT INTO card_drafts
       (id, user_id, type, draft_data, thumbnail_url, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, args.type, dataJson, args.thumbnailUrl ?? null, args.title ?? null, now, now);
  const row = db.prepare('SELECT * FROM card_drafts WHERE id = ?').get(id) as any;
  return parseCardDraftRow(row);
}

export function getDrafts(userId: string, limit = 50, offset = 0): DbCardDraft[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  const rows = db
    .prepare('SELECT * FROM card_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(userId, n, off) as any[];
  return rows.map(parseCardDraftRow);
}

export function getDraft(userId: string, draftId: string): DbCardDraft | null {
  if (!userId || !draftId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM card_drafts WHERE id = ? AND user_id = ?')
    .get(draftId, userId) as any;
  return row ? parseCardDraftRow(row) : null;
}

export function deleteDraft(userId: string, draftId: string): boolean {
  if (!userId || !draftId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM card_drafts WHERE id = ? AND user_id = ?')
    .run(draftId, userId);
  return r.changes > 0;
}
