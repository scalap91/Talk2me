// /lib/db/memories.ts — Mémoires long terme de l'IA personnelle, strictement
// isolées par user_id. Doctrine [[talktome-ia-persistance-isolation]].

import { randomUUID } from 'crypto';
import { getDb } from './_core';

export type AiMemoryKind = 'preference' | 'habit' | 'fact' | 'style';

export interface DbAiMemory {
  id: string;
  user_id: string;
  kind: AiMemoryKind;
  content: string;
  weight: number;
  source_conv_id: string | null;
  source_message_id: string | null;
  created_at: number;
  last_used_at: number | null;
}

function parseAiMemoryRow(row: any): DbAiMemory {
  const k = row.kind;
  const kind: AiMemoryKind =
    k === 'habit' || k === 'fact' || k === 'style' ? k : 'preference';
  return {
    id: row.id,
    user_id: row.user_id,
    kind,
    content: row.content ?? '',
    weight: typeof row.weight === 'number' ? row.weight : 1.0,
    source_conv_id: typeof row.source_conv_id === 'string' ? row.source_conv_id : null,
    source_message_id:
      typeof row.source_message_id === 'string' ? row.source_message_id : null,
    created_at: row.created_at,
    last_used_at: typeof row.last_used_at === 'number' ? row.last_used_at : null,
  };
}

export interface AddAiMemoryInput {
  userId: string;
  kind?: AiMemoryKind;
  content: string;
  sourceConvId?: string | null;
  sourceMessageId?: string | null;
  weight?: number;
}

export function addAiMemory(input: AddAiMemoryInput): DbAiMemory {
  const userId = (input.userId || '').trim();
  if (!userId) throw new Error('user_id_required');
  const content = (input.content || '').trim();
  if (!content) throw new Error('content_required');
  if (content.length > 500) throw new Error('content_too_long');
  const kind: AiMemoryKind =
    input.kind === 'habit' || input.kind === 'fact' || input.kind === 'style'
      ? input.kind
      : 'preference';
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const weight = typeof input.weight === 'number' && input.weight > 0 ? input.weight : 1.0;
  db.prepare(
    'INSERT INTO ai_memories (id, user_id, kind, content, weight, source_conv_id, source_message_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
  ).run(
    id,
    userId,
    kind,
    content,
    weight,
    input.sourceConvId ?? null,
    input.sourceMessageId ?? null,
    now
  );
  return {
    id,
    user_id: userId,
    kind,
    content,
    weight,
    source_conv_id: input.sourceConvId ?? null,
    source_message_id: input.sourceMessageId ?? null,
    created_at: now,
    last_used_at: null,
  };
}

/**
 * Récupère les memories du user owner — top N par weight DESC + recency.
 * STRICTEMENT scopé user_id, jamais cross-user (isolation).
 */
export function getAiMemories(userId: string, limit: number = 20): DbAiMemory[] {
  if (!userId) return [];
  const db = getDb();
  const n = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = db
    .prepare(
      'SELECT * FROM ai_memories WHERE user_id = ? ORDER BY weight DESC, created_at DESC LIMIT ?'
    )
    .all(userId, n) as any[];
  return rows.map(parseAiMemoryRow);
}

export function deleteAiMemory(userId: string, memoryId: string): boolean {
  if (!userId || !memoryId) return false;
  const db = getDb();
  const r = db
    .prepare('DELETE FROM ai_memories WHERE id = ? AND user_id = ?')
    .run(memoryId, userId);
  return r.changes > 0;
}

export function touchAiMemoryUsage(memoryId: string): void {
  if (!memoryId) return;
  const db = getDb();
  db.prepare('UPDATE ai_memories SET last_used_at = ? WHERE id = ?').run(
    Date.now(),
    memoryId
  );
}
