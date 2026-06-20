// /lib/db/conversations.ts — Conversations CRUD (agent + P2P + activities).
//
// Inclut : getOrCreateUserConversation (agent), createP2PConversation,
// getConversation, listUserConversations, updateConversationPreview,
// markConversationRead, presence helpers, activities helpers.
//
// Note : getOrCreateUserConversation est appelé par users.createUser via un
// require dynamique pour éviter un cycle d'import.

import { randomUUID } from 'crypto';
import type { Activity, ActivityKind } from '@/lib/activity-types';
import { getDb } from './_core';
import { parseUserRow, type DbUser, getUserById } from './users';

// ===================== Types =====================

export interface DbConversation {
  id: string;
  user_id: string;
  created_at: number;
}

export type ConversationKind = 'agent' | 'p2p' | 'group';

export interface DbConversationFull {
  id: string;
  kind: ConversationKind;
  created_by: string | null;
  created_at: number;
  last_message_preview: string | null;
  last_message_at: number | null;
  participants: DbUser[];
}

export interface ConversationListItem extends DbConversationFull {
  /** "L'autre" pour une conv p2p, l'agent Talk2Me pour kind=agent (null côté DB). */
  peer: DbUser | null;
  unread_count: number;
}

export interface DbPresence {
  user_id: string;
  last_seen: number;
  status: 'online' | 'away' | 'offline';
}

export interface DbActivityRow {
  id: string;
  conv_id: string;
  kind: ActivityKind;
  state: string;            // JSON sérialisé
  started_by: string;
  started_at: number;
  ended_at: number | null;
}

// ===================== USER CONVERSATIONS (agent) =====================

/**
 * Retourne (ou crée) LA conversation 1-to-1 de l'user avec Talk2Me (kind='agent').
 * - Phase 3 : inscrit aussi le user dans conversation_participants.
 * - Rétro-compat : sélectionne la conv kind='agent' OU sans kind (NULL legacy).
 */
export function getOrCreateUserConversation(userId: string): DbConversation {
  if (!userId) throw new Error('userId required');
  const db = getDb();

  const existing = db
    .prepare(
      `SELECT * FROM conversations
         WHERE user_id = ? AND (kind IS NULL OR kind = 'agent')
         ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId) as any;

  if (existing) {
    // Phase 3 : garantir présence dans conversation_participants
    db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run(existing.id, userId, existing.created_at || Date.now());
    return {
      id: existing.id,
      user_id: existing.user_id,
      created_at: existing.created_at,
    };
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
  ).run(id, userId, now, userId);
  db.prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(id, userId, now);

  return { id, user_id: userId, created_at: now };
}

/** Alias plus parlant : utilisable côté pages Messages. */
export const getOrCreateAgentConversation = getOrCreateUserConversation;

/**
 * Reset la conversation 1-to-1 d'un user : supprime tous ses messages et la conversation.
 * Les posts publiés référençant des message_ids deviennent orphelins (accepté MVP).
 */
export function resetUserConversation(userId: string): number {
  if (!userId) return 0;
  const db = getDb();
  const conv = db
    .prepare(
      'SELECT id FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(userId) as { id?: string } | undefined;
  if (!conv?.id) return 0;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM posts WHERE conversation_id = ?').run(conv.id);
    const r = db
      .prepare('DELETE FROM messages WHERE conversation_id = ?')
      .run(conv.id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
    return r.changes;
  });
  return tx();
}

// ===================== CONVERSATIONS MULTI-PARTICIPANTS (P2P) =====================

function getConversationRow(convId: string): any | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as any) ||
    null
  );
}

function loadParticipants(convId: string): DbUser[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.* FROM conversation_participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.conversation_id = ?
         ORDER BY p.joined_at ASC`
    )
    .all(convId) as any[];
  return rows.map(parseUserRow);
}

/**
 * Crée (ou retourne) une conversation 1-to-1 entre 2 users (kind='p2p').
 * Idempotent : si une conv p2p existe déjà avec exactement ces 2 participants,
 * on la renvoie. Sinon création + 2 participants.
 */
export function createP2PConversation(userIdA: string, userIdB: string): DbConversationFull {
  if (!userIdA || !userIdB) throw new Error('user ids required');
  if (userIdA === userIdB) throw new Error('cannot_p2p_self');
  const db = getDb();
  if (!getUserById(userIdA) || !getUserById(userIdB)) {
    throw new Error('user_not_found');
  }
  // Cherche une conv p2p existante contenant exactement ces 2 participants.
  const existing = db
    .prepare(
      `SELECT c.id FROM conversations c
         WHERE c.kind = 'p2p'
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND (SELECT COUNT(*) FROM conversation_participants p
                WHERE p.conversation_id = c.id) = 2
         LIMIT 1`
    )
    .get(userIdA, userIdB) as { id?: string } | undefined;
  if (existing?.id) {
    return getConversation(existing.id, userIdA)!;
  }
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'p2p', ?)"
    ).run(id, userIdA, now, userIdA);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    ins.run(id, userIdA, now);
    ins.run(id, userIdB, now);
  });
  tx();
  return {
    id,
    kind: 'p2p',
    created_by: userIdA,
    created_at: now,
    last_message_preview: null,
    last_message_at: null,
    participants: loadParticipants(id),
  };
}

/**
 * Retourne une conversation si le user est participant, sinon null.
 */
export function getConversation(convId: string, userId: string): DbConversationFull | null {
  if (!convId || !userId) return null;
  const db = getDb();
  const row = getConversationRow(convId);
  if (!row) return null;
  const isParticipant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1'
    )
    .get(convId, userId);
  if (!isParticipant) return null;
  return {
    id: row.id,
    kind: (row.kind as ConversationKind) || 'agent',
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    last_message_preview: row.last_message_preview ?? null,
    last_message_at: row.last_message_at ?? null,
    participants: loadParticipants(convId),
  };
}

/**
 * Liste les conversations du user, triées DESC last_message_at (NULL en
 * dernier). Pour chaque conv, retourne participants, peer (= l'autre dans p2p,
 * null pour agent ou self-only), unread_count (basé sur last_read_at).
 */
let _hiddenColEnsured = false;
function ensureHiddenCol() {
  if (_hiddenColEnsured) return;
  try { getDb().exec('ALTER TABLE conversation_participants ADD COLUMN hidden_at INTEGER'); } catch { /* déjà */ }
  _hiddenColEnsured = true;
}

/** Masque une conversation de la liste de CE user (sans toucher celle des autres).
 *  Réapparaît si un nouveau message arrive après le masquage. (Pascal 2026-06-17) */
export function hideConversationForUser(convId: string, userId: string): boolean {
  if (!convId || !userId) return false;
  ensureHiddenCol();
  return getDb().prepare(
    'UPDATE conversation_participants SET hidden_at = ? WHERE conversation_id = ? AND user_id = ?'
  ).run(Date.now(), convId, userId).changes > 0;
}

export function listUserConversations(userId: string): ConversationListItem[] {
  if (!userId) return [];
  ensureHiddenCol();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, p.last_read_at AS my_last_read
         FROM conversation_participants p
         JOIN conversations c ON c.id = p.conversation_id
         WHERE p.user_id = ?
           AND (p.hidden_at IS NULL OR COALESCE(c.last_message_at, 0) > p.hidden_at)
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(userId) as any[];

  const out: ConversationListItem[] = [];
  for (const row of rows) {
    const participants = loadParticipants(row.id);
    const peer =
      (row.kind as ConversationKind) === 'p2p'
        ? participants.find((p) => p.id !== userId) || null
        : null;
    const lastRead = typeof row.my_last_read === 'number' ? row.my_last_read : 0;
    const unreadRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
           WHERE conversation_id = ? AND created_at > ?
             AND role = 'user'`
      )
      .get(row.id, lastRead) as { c?: number } | undefined;
    out.push({
      id: row.id,
      kind: (row.kind as ConversationKind) || 'agent',
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      last_message_preview: row.last_message_preview ?? null,
      last_message_at: row.last_message_at ?? null,
      participants,
      peer,
      unread_count: unreadRow?.c ?? 0,
    });
  }
  return out;
}

/** Met à jour preview + timestamp d'une conversation (utilisé en P2P broadcast). */
export function updateConversationPreview(
  convId: string,
  text: string,
  ts: number
): void {
  if (!convId) return;
  const db = getDb();
  const preview = (text || '').trim().slice(0, 140);
  db.prepare(
    'UPDATE conversations SET last_message_preview = ?, last_message_at = ? WHERE id = ?'
  ).run(preview, ts, convId);
}

/** Marque la conversation comme lue par le user (pour unread_count). */
export function markConversationRead(convId: string, userId: string): void {
  if (!convId || !userId) return;
  const db = getDb();
  db.prepare(
    'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
  ).run(Date.now(), convId, userId);
}

// ===================== PRÉSENCE =====================

export function updatePresence(
  userId: string,
  status: DbPresence['status'] = 'online'
): DbPresence {
  if (!userId) throw new Error('userId required');
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO presence (user_id, last_seen, status) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen, status = excluded.status`
  ).run(userId, now, status);
  return { user_id: userId, last_seen: now, status };
}

export function getPresence(userId: string): DbPresence | null {
  if (!userId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM presence WHERE user_id = ?').get(userId) as any;
  if (!row) return null;
  return {
    user_id: row.user_id,
    last_seen: row.last_seen,
    status: (row.status as DbPresence['status']) || 'online',
  };
}

const PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min

/** Liste les amis online (last_seen < 5min). */
export function getOnlineFriends(
  userId: string
): Array<DbUser & { presence: DbPresence }> {
  if (!userId) return [];
  const db = getDb();
  const cutoff = Date.now() - PRESENCE_ONLINE_WINDOW_MS;
  const rows = db
    .prepare(
      `SELECT u.*, pr.last_seen AS p_last_seen, pr.status AS p_status
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         JOIN presence pr ON pr.user_id = u.id
         WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
           AND pr.last_seen >= ?
         ORDER BY pr.last_seen DESC`
    )
    .all(userId, userId, userId, cutoff) as any[];
  return rows.map((r) => ({
    ...parseUserRow(r),
    presence: {
      user_id: r.id,
      last_seen: r.p_last_seen,
      status: (r.p_status as DbPresence['status']) || 'online',
    },
  }));
}

/** Retourne la map des presences pour une liste d'user ids. */
export function getPresences(userIds: string[]): Record<string, DbPresence> {
  if (!userIds.length) return {};
  const db = getDb();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM presence WHERE user_id IN (${placeholders})`)
    .all(...userIds) as any[];
  const out: Record<string, DbPresence> = {};
  for (const r of rows) {
    out[r.user_id] = {
      user_id: r.user_id,
      last_seen: r.last_seen,
      status: (r.status as DbPresence['status']) || 'online',
    };
  }
  return out;
}

// ===================== ACTIVITÉS SYNCHRONISÉES =====================

function parseActivityRow(row: any): Activity<unknown> {
  let state: unknown = null;
  try {
    state = row.state ? JSON.parse(row.state) : null;
  } catch {
    state = null;
  }
  return {
    id: row.id,
    conv_id: row.conv_id,
    kind: row.kind as ActivityKind,
    state,
    started_by: row.started_by,
    started_at: row.started_at,
  };
}

/**
 * Démarre une activité dans une conversation. La logique d'auth/membership est
 * vérifiée côté API (route handler). On termine automatiquement les éventuelles
 * activités encore ouvertes (ended_at IS NULL) pour cette conv afin qu'il n'y
 * en ait qu'une active à la fois (MVP).
 */
export function startActivity(
  convId: string,
  kind: ActivityKind,
  state: unknown,
  startedBy: string
): Activity<unknown> {
  if (!convId) throw new Error('convId required');
  if (!startedBy) throw new Error('startedBy required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    // Ferme toute activité encore ouverte pour cette conv
    db.prepare(
      'UPDATE activities SET ended_at = ? WHERE conv_id = ? AND ended_at IS NULL'
    ).run(now, convId);
    db.prepare(
      'INSERT INTO activities (id, conv_id, kind, state, started_by, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    ).run(id, convId, kind, JSON.stringify(state ?? null), startedBy, now);
  });
  tx();
  return {
    id,
    conv_id: convId,
    kind,
    state,
    started_by: startedBy,
    started_at: now,
  };
}

/**
 * Met à jour le state d'une activité (typiquement après play/pause/seek du
 * leader pour une VideoSyncState). Renvoie l'activité mise à jour ou null si
 * inexistante / déjà terminée.
 */
export function updateActivityState(
  activityId: string,
  state: unknown
): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET state = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(JSON.stringify(state ?? null), activityId);
  if (r.changes === 0) return null;
  const row = db
    .prepare('SELECT * FROM activities WHERE id = ?')
    .get(activityId) as any;
  return row ? parseActivityRow(row) : null;
}

/** Termine une activité (ended_at = now). Idempotent. */
export function endActivity(activityId: string): boolean {
  if (!activityId) return false;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET ended_at = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(Date.now(), activityId);
  return r.changes > 0;
}

/**
 * Récupère l'activité active d'une conversation (ended_at IS NULL). MVP : une
 * seule activité active à la fois par conv. Retourne null sinon.
 */
export function getActiveActivity(convId: string): Activity<unknown> | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      'SELECT * FROM activities WHERE conv_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(convId) as any;
  return row ? parseActivityRow(row) : null;
}

/** Récupère une activité par id (active ou terminée). */
export function getActivityById(activityId: string): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM activities WHERE id = ?')
    .get(activityId) as any;
  return row ? parseActivityRow(row) : null;
}

/**
 * Vérifie qu'un user est participant de la conversation à laquelle appartient
 * une activité. Helper pour autoriser update/end depuis les routes.
 */
export function userCanAccessActivity(
  activityId: string,
  userId: string
): { activity: Activity<unknown>; convId: string } | null {
  if (!activityId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.* FROM activities a
         JOIN conversation_participants p
           ON p.conversation_id = a.conv_id
         WHERE a.id = ? AND p.user_id = ?
         LIMIT 1`
    )
    .get(activityId, userId) as any;
  if (!row) return null;
  return { activity: parseActivityRow(row), convId: row.conv_id };
}
