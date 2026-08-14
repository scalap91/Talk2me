/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-conversations — domaine « conversations » (solo/P2P/groupes, presence,
 * activites synchronisees, jeux echecs/dames) extrait de lib/db.ts (decoupage
 * #53/db-core, Pascal 2026-06-30). Primitives via @/lib/db-core. Re-exporte par db.ts.
 */
import { randomUUID } from 'crypto';
import type { Activity, ActivityKind } from '@/lib/activity-types';
import { getDb, parseUserRow } from '@/lib/db-core';
import type { DbUser } from '@/lib/db-core';
import { getUserById } from '@/lib/db'; // cross-domaine (users deja extrait), facade lazy

// ============ conversations ============
// /lib/db/conversations.ts — Conversations CRUD (agent + P2P + activities).
//
// Inclut : getOrCreateUserConversation (agent), createP2PConversation,
// getConversation, listUserConversations, updateConversationPreview,
// markConversationRead, presence helpers, activities helpers.
//
// Note : getOrCreateUserConversation est appelé par users.createUser via un
// require dynamique pour éviter un cycle d'import.



// ===================== Types =====================

export interface DbConversation {
  id: string;
  user_id: string;
  created_at: number;
}

export type ConversationKind = 'agent' | 'p2p' | 'group' | 'commerce';

export interface DbConversationFull {
  id: string;
  kind: ConversationKind;
  /** Nom du groupe (kind='group'). null pour p2p/agent. */
  name?: string | null;
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
  /** Prefs PAR-USER (conversation_participants du user courant). Jamais global. */
  pinned: boolean;
  archived: boolean;
  muted: boolean;
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
export function createP2PConversation(userIdA: string, userIdB: string, kind: 'p2p' | 'commerce' = 'p2p'): DbConversationFull {
  if (!userIdA || !userIdB) throw new Error('user ids required');
  if (userIdA === userIdB) throw new Error('cannot_p2p_self');
  const db = getDb();
  if (!getUserById(userIdA) || !getUserById(userIdB)) {
    throw new Error('user_not_found');
  }
  // Dédup PAR KIND : une conv 'commerce' (litige vendeur/acheteur) est SÉPARÉE de la
  // conv sociale 'p2p' entre les 2 mêmes users (Pascal 2026-06-27).
  const existing = db
    .prepare(
      `SELECT c.id FROM conversations c
         WHERE c.kind = ?
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.user_id = ?)
           AND (SELECT COUNT(*) FROM conversation_participants p
                WHERE p.conversation_id = c.id) = 2
         LIMIT 1`
    )
    .get(kind, userIdA, userIdB) as { id?: string } | undefined;
  if (existing?.id) {
    return getConversation(existing.id, userIdA)!;
  }
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userIdA, now, kind, userIdA);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    ins.run(id, userIdA, now);
    ins.run(id, userIdB, now);
  });
  tx();
  return {
    id,
    kind,
    created_by: userIdA,
    created_at: now,
    last_message_preview: null,
    last_message_at: null,
    participants: loadParticipants(id),
  };
}

/** Conversation COMMERCE (litige vendeur↔acheteur) — séparée du social, visible
 *  uniquement dans le Shop. Pascal 2026-06-27. */
export function createCommerceConversation(buyerId: string, sellerId: string): DbConversationFull {
  return createP2PConversation(buyerId, sellerId, 'commerce');
}

/** Crée une conversation de GROUPE (kind='group') avec un nom + des membres. */
export function createGroupConversation(creatorId: string, name: string, memberIds: string[]): DbConversationFull {
  if (!creatorId) throw new Error('creator_required');
  const db = getDb();
  if (!getUserById(creatorId)) throw new Error('creator_not_found');
  const groupName = (name || '').trim().slice(0, 80) || 'Groupe';
  // Membres valides + uniques + créateur inclus.
  const ids = Array.from(new Set([creatorId, ...memberIds.filter((m) => typeof m === 'string' && m.trim())]));
  const valid = ids.filter((mid) => !!getUserById(mid));
  if (valid.length < 2) throw new Error('need_members');
  const id = randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO conversations (id, user_id, created_at, kind, created_by, name) VALUES (?, ?, ?, 'group', ?, ?)"
    ).run(id, creatorId, now, creatorId, groupName);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    for (const mid of valid) ins.run(id, mid, now);
  });
  tx();
  return {
    id,
    kind: 'group',
    name: groupName,
    created_by: creatorId,
    created_at: now,
    last_message_preview: null,
    last_message_at: null,
    participants: loadParticipants(id),
  };
}

// ── Gestion des membres d'un GROUPE (#groupe, Pascal 2026-06-09) ──
function isParticipant(convId: string, userId: string): boolean {
  return !!getDb()
    .prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?')
    .get(convId, userId);
}
function groupMeta(convId: string): { created_by: string; kind: string; name: string | null } | null {
  const r = getDb().prepare('SELECT created_by, kind, name FROM conversations WHERE id = ?').get(convId) as
    | { created_by: string; kind: string; name: string | null }
    | undefined;
  return r ?? null;
}

/** Ajoute des membres à un groupe. L'acteur doit déjà être membre. */
export function addGroupMembers(convId: string, actorId: string, userIds: string[]): { ok: boolean; added: number; error?: string } {
  const meta = groupMeta(convId);
  if (!meta || meta.kind !== 'group') return { ok: false, added: 0, error: 'not_group' };
  if (!isParticipant(convId, actorId)) return { ok: false, added: 0, error: 'forbidden' };
  const now = Date.now();
  const ins = getDb().prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  );
  let added = 0;
  for (const uid of userIds) {
    if (typeof uid === 'string' && getUserById(uid)) added += ins.run(convId, uid, now).changes;
  }
  return { ok: true, added };
}

/** Retire un membre. Autorisé : le créateur (retire qui il veut) OU soi-même. */
export function removeGroupMember(convId: string, actorId: string, userId: string): { ok: boolean; error?: string } {
  const meta = groupMeta(convId);
  if (!meta || meta.kind !== 'group') return { ok: false, error: 'not_group' };
  if (actorId !== meta.created_by && actorId !== userId) return { ok: false, error: 'forbidden' };
  if (userId === meta.created_by) return { ok: false, error: 'cant_remove_owner' };
  getDb().prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(convId, userId);
  return { ok: true };
}

/** Quitter un groupe (soi-même). Le créateur ne peut pas quitter (doit supprimer). */
export function leaveGroup(convId: string, userId: string): { ok: boolean; error?: string } {
  const meta = groupMeta(convId);
  if (!meta || meta.kind !== 'group') return { ok: false, error: 'not_group' };
  if (userId === meta.created_by) return { ok: false, error: 'owner_cant_leave' };
  getDb().prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(convId, userId);
  return { ok: true };
}

/** Renommer le groupe. L'acteur doit être membre. */
export function renameGroup(convId: string, actorId: string, name: string): { ok: boolean; error?: string } {
  const meta = groupMeta(convId);
  if (!meta || meta.kind !== 'group') return { ok: false, error: 'not_group' };
  if (!isParticipant(convId, actorId)) return { ok: false, error: 'forbidden' };
  const n = (name || '').trim().slice(0, 80);
  if (!n) return { ok: false, error: 'empty' };
  getDb().prepare('UPDATE conversations SET name = ? WHERE id = ?').run(n, convId);
  return { ok: true };
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
    name: row.name ?? null,
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
export function listUserConversations(userId: string): ConversationListItem[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, p.last_read_at AS my_last_read,
              p.pinned_at AS my_pinned_at,
              p.archived_at AS my_archived_at,
              p.muted_until AS my_muted_until
         FROM conversation_participants p
         JOIN conversations c ON c.id = p.conversation_id
         WHERE p.user_id = ?
           AND (p.hidden_at IS NULL OR COALESCE(c.last_message_at, c.created_at) > p.hidden_at)
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
      name: row.name ?? null,
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      last_message_preview: row.last_message_preview ?? null,
      last_message_at: row.last_message_at ?? null,
      participants,
      peer,
      unread_count: unreadRow?.c ?? 0,
      pinned: row.my_pinned_at != null,
      archived: row.my_archived_at != null,
      muted: typeof row.my_muted_until === 'number' && row.my_muted_until > Date.now(),
    });
  }
  return out;
}

// ===================== PRÉFS PAR-USER (WhatsApp-like) =====================
// Épingler / Archiver / Muet : n'affectent QUE la vue de CE user (comme hide),
// via conversation_participants. Jamais global. NULL = pas mis. (Lot 1)
// (Réutilise isParticipant() défini plus haut comme garde-fou.)

/** Épingle / désépingle la conv pour CE user (pinned_at = now | NULL). */
export function setConversationPinned(convId: string, userId: string, on: boolean): boolean {
  if (!isParticipant(convId, userId)) return false;
  return getDb()
    .prepare(
      'UPDATE conversation_participants SET pinned_at = ? WHERE conversation_id = ? AND user_id = ?'
    )
    .run(on ? Date.now() : null, convId, userId).changes > 0;
}

/** Archive / désarchive la conv pour CE user (archived_at = now | NULL). */
export function setConversationArchived(convId: string, userId: string, on: boolean): boolean {
  if (!isParticipant(convId, userId)) return false;
  return getDb()
    .prepare(
      'UPDATE conversation_participants SET archived_at = ? WHERE conversation_id = ? AND user_id = ?'
    )
    .run(on ? Date.now() : null, convId, userId).changes > 0;
}

/** Met en sourdine la conv pour CE user jusqu'à `until` (ms epoch) ; NULL = réactive. */
export function setConversationMuted(convId: string, userId: string, until: number | null): boolean {
  if (!isParticipant(convId, userId)) return false;
  return getDb()
    .prepare(
      'UPDATE conversation_participants SET muted_until = ? WHERE conversation_id = ? AND user_id = ?'
    )
    .run(until, convId, userId).changes > 0;
}

/** Slide-supprimer : masque la conv de MA liste (hidden_at = now). Réapparaît si un
 *  NOUVEAU message arrive (last_message_at > hidden_at), façon WhatsApp. Par-user.
 *  Rebranché sur la table LIVE (le module découplé lib/db/conversations ne l'était plus). */
export function hideConversationForUser(convId: string, userId: string): boolean {
  if (!isParticipant(convId, userId)) return false;
  return getDb()
    .prepare(
      'UPDATE conversation_participants SET hidden_at = ? WHERE conversation_id = ? AND user_id = ?'
    )
    .run(Date.now(), convId, userId).changes > 0;
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

/**
 * Marque la conversation comme NON-lue par CE user (Lot 2 — WhatsApp-like).
 * Inverse de markConversationRead : on recule `last_read_at` juste AVANT le
 * dernier message comptabilisé (role='user') du fil pour forcer unread_count ≥ 1.
 *
 * Pourquoi (last_user_msg_at - 1) plutôt que 0 : la requête unread_count de
 * listUserConversations compte `messages WHERE created_at > last_read_at AND
 * role='user'`. En visant (dernier message user − 1), on obtient EXACTEMENT 1
 * non-lu (le dernier), pas la totalité de l'historique — badge propre, comme
 * WhatsApp. NULL/aucun message user → 0 (rien à marquer, idempotent).
 * PAR-USER : n'affecte QUE la vue de ce user (conversation_participants).
 */
export function markConversationUnread(convId: string, userId: string): void {
  if (!convId || !userId) return;
  const db = getDb();
  if (!isParticipant(convId, userId)) return;
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS last_user_at FROM messages
         WHERE conversation_id = ? AND role = 'user'`
    )
    .get(convId) as { last_user_at?: number } | undefined;
  const lastUserAt = typeof row?.last_user_at === 'number' ? row.last_user_at : null;
  const target = lastUserAt != null ? lastUserAt - 1 : 0;
  db.prepare(
    'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
  ).run(target, convId, userId);
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
  // Talk2Me #408 — invite_status propagé (rétro-compat : 'accepted' si NULL).
  const inviteStatus =
    row.invite_status === 'pending' ||
    row.invite_status === 'declined' ||
    row.invite_status === 'ended' ||
    row.invite_status === 'accepted'
      ? (row.invite_status as 'pending' | 'accepted' | 'declined' | 'ended')
      : 'accepted';
  return {
    id: row.id,
    conv_id: row.conv_id,
    kind: row.kind as ActivityKind,
    state,
    started_by: row.started_by,
    started_at: row.started_at,
    invite_status: inviteStatus,
  };
}

/**
 * Démarre une activité dans une conversation. La logique d'auth/membership est
 * vérifiée côté API (route handler). On termine automatiquement les éventuelles
 * activités encore ouvertes (ended_at IS NULL) pour cette conv afin qu'il n'y
 * en ait qu'une active à la fois (MVP).
 *
 * Talk2Me #408 — invite_status par défaut 'pending' pour Watch Together
 * (consentement explicite). Le caller peut forcer 'accepted' (cas solo / jeux
 * solo vs Léa où le destinataire est l'IA, pas besoin d'opt-in).
 */
export function startActivity(
  convId: string,
  kind: ActivityKind,
  state: unknown,
  startedBy: string,
  inviteStatus: 'pending' | 'accepted' = 'pending'
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
      'INSERT INTO activities (id, conv_id, kind, state, started_by, started_at, ended_at, invite_status) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).run(id, convId, kind, JSON.stringify(state ?? null), startedBy, now, inviteStatus);
  });
  tx();
  return {
    id,
    conv_id: convId,
    kind,
    state,
    started_by: startedBy,
    started_at: now,
    invite_status: inviteStatus,
  };
}

/**
 * Talk2Me #408 — Update invite_status d'une activité (Pascal 2026-06-05).
 * Retourne l'activité MAJ ou null si introuvable / déjà ended.
 */
export function setActivityInviteStatus(
  activityId: string,
  status: 'pending' | 'accepted' | 'declined' | 'ended'
): Activity<unknown> | null {
  if (!activityId) return null;
  const db = getDb();
  const r = db
    .prepare(
      'UPDATE activities SET invite_status = ? WHERE id = ? AND ended_at IS NULL'
    )
    .run(status, activityId);
  if (r.changes === 0) return null;
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId) as any;
  return row ? parseActivityRow(row) : null;
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

// ===================== Talk2Me #408 — JEUX (chess + dames) =====================
// Doctrine [[talktome-produit-abouti]] : pas un MVP, plateaux complets.
//
// Les helpers ci-dessous sont volontairement plats (pas de validation moves) :
// la validation chess est faite via chess.js dans /api/chess/[id]/move ; la
// validation dame via lib/games/dame-engine.ts. La DB n'est qu'un store.

import type {
  ChessGame,
  DameGame,
  DameGameState,
  DameMove,
  GameStatus,
} from '@/lib/games/types';

// Ré-export des types de parties : les helpers DB ci-dessous (getChessGame,
// createDameGame, …) renvoient ces types, donc @/lib/db (export * de ce module)
// doit aussi les exposer. Source unique : lib/games/types.ts.
export type { ChessGame, DameGame, DameGameState } from '@/lib/games/types';

// ----- CHESS -----

function parseChessRow(row: any): ChessGame {
  let moves: string[] = [];
  try {
    const p = row.moves ? JSON.parse(row.moves) : [];
    if (Array.isArray(p)) moves = p.filter((m): m is string => typeof m === 'string');
  } catch { /* ignore */ }
  return {
    id: row.id,
    conv_id: row.conv_id,
    activity_id: row.activity_id ?? null,
    player_white: row.player_white,
    player_black: row.player_black,
    fen: row.fen,
    moves,
    status: (row.status as GameStatus) || 'in_progress',
    winner: row.winner ?? null,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    // Talk2Me #416 (Pascal 2026-06-05) — mode arbitre + pause.
    arbiter: typeof row.arbiter === 'string' && row.arbiter ? row.arbiter : null,
    paused_at: typeof row.paused_at === 'number' ? row.paused_at : null,
  };
}

export function createChessGame(args: {
  convId: string;
  activityId: string | null;
  playerWhite: string;
  playerBlack: string;
  startFen: string;
  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Si 'lea', Léa arbitre. Sinon NULL.
   * Quand arbiter='lea', NE PAS mettre 'lea' dans player_white/player_black :
   * elle observe, ne joue pas. Pascal verbatim : "Léa N'A PAS LE DROIT DE
   * JOUER, elle enregistre juste le jeu".
   */
  arbiter?: string | null;
}): ChessGame {
  if (!args.convId) throw new Error('convId required');
  if (!args.playerWhite || !args.playerBlack) throw new Error('players required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO chess_games
       (id, conv_id, activity_id, player_white, player_black, fen, moves, status, winner, started_at, ended_at, arbiter, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'in_progress', NULL, ?, NULL, ?, NULL)`
  ).run(
    id, args.convId, args.activityId, args.playerWhite, args.playerBlack, args.startFen, now,
    args.arbiter || null
  );
  const row = db.prepare('SELECT * FROM chess_games WHERE id = ?').get(id) as any;
  return parseChessRow(row);
}

export function getChessGame(gameId: string): ChessGame | null {
  if (!gameId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM chess_games WHERE id = ?').get(gameId) as any;
  return row ? parseChessRow(row) : null;
}

export function getActiveChessGameForConv(convId: string): ChessGame | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM chess_games WHERE conv_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    )
    .get(convId) as any;
  return row ? parseChessRow(row) : null;
}

export function applyChessMove(args: {
  gameId: string;
  fen: string;
  moves: string[];
  status: GameStatus;
  winner: string | null;
}): ChessGame | null {
  const db = getDb();
  const now = Date.now();
  const endedAt = args.status === 'in_progress' ? null : now;
  const r = db
    .prepare(
      `UPDATE chess_games
         SET fen = ?, moves = ?, status = ?, winner = ?, ended_at = COALESCE(?, ended_at)
         WHERE id = ?`
    )
    .run(args.fen, JSON.stringify(args.moves), args.status, args.winner, endedAt, args.gameId);
  if (r.changes === 0) return null;
  return getChessGame(args.gameId);
}

export function userCanAccessChessGame(
  gameId: string,
  userId: string
): { game: ChessGame; convId: string } | null {
  if (!gameId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.* FROM chess_games g
         JOIN conversation_participants p ON p.conversation_id = g.conv_id
        WHERE g.id = ? AND p.user_id = ?
        LIMIT 1`
    )
    .get(gameId, userId) as any;
  if (!row) return null;
  return { game: parseChessRow(row), convId: row.conv_id };
}

// ----- DAMES -----

function parseDameRow(row: any): DameGame {
  let state: DameGameState = { board: [], turn: 'white' };
  try {
    const p = row.state ? JSON.parse(row.state) : null;
    if (p && Array.isArray(p.board) && (p.turn === 'white' || p.turn === 'black')) {
      state = p as DameGameState;
    }
  } catch { /* ignore */ }
  let moves: DameMove[] = [];
  try {
    const p = row.moves ? JSON.parse(row.moves) : [];
    if (Array.isArray(p)) moves = p as DameMove[];
  } catch { /* ignore */ }
  return {
    id: row.id,
    conv_id: row.conv_id,
    activity_id: row.activity_id ?? null,
    player_white: row.player_white,
    player_black: row.player_black,
    state,
    moves,
    status: (row.status as GameStatus) || 'in_progress',
    winner: row.winner ?? null,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    // Talk2Me #416 (Pascal 2026-06-05) — mode arbitre + pause.
    arbiter: typeof row.arbiter === 'string' && row.arbiter ? row.arbiter : null,
    paused_at: typeof row.paused_at === 'number' ? row.paused_at : null,
  };
}

export function createDameGame(args: {
  convId: string;
  activityId: string | null;
  playerWhite: string;
  playerBlack: string;
  initialState: DameGameState;
  /** Voir createChessGame.arbiter — Talk2Me #416. */
  arbiter?: string | null;
}): DameGame {
  if (!args.convId) throw new Error('convId required');
  if (!args.playerWhite || !args.playerBlack) throw new Error('players required');
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO dame_games
       (id, conv_id, activity_id, player_white, player_black, state, moves, status, winner, started_at, ended_at, arbiter, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'in_progress', NULL, ?, NULL, ?, NULL)`
  ).run(
    id, args.convId, args.activityId, args.playerWhite, args.playerBlack,
    JSON.stringify(args.initialState), now, args.arbiter || null
  );
  const row = db.prepare('SELECT * FROM dame_games WHERE id = ?').get(id) as any;
  return parseDameRow(row);
}

export function getDameGame(gameId: string): DameGame | null {
  if (!gameId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM dame_games WHERE id = ?').get(gameId) as any;
  return row ? parseDameRow(row) : null;
}

export function getActiveDameGameForConv(convId: string): DameGame | null {
  if (!convId) return null;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM dame_games WHERE conv_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    )
    .get(convId) as any;
  return row ? parseDameRow(row) : null;
}

export function applyDameMove(args: {
  gameId: string;
  state: DameGameState;
  moves: DameMove[];
  status: GameStatus;
  winner: string | null;
}): DameGame | null {
  const db = getDb();
  const now = Date.now();
  const endedAt = args.status === 'in_progress' ? null : now;
  const r = db
    .prepare(
      `UPDATE dame_games
         SET state = ?, moves = ?, status = ?, winner = ?, ended_at = COALESCE(?, ended_at)
         WHERE id = ?`
    )
    .run(
      JSON.stringify(args.state), JSON.stringify(args.moves), args.status, args.winner,
      endedAt, args.gameId
    );
  if (r.changes === 0) return null;
  return getDameGame(args.gameId);
}

export function userCanAccessDameGame(
  gameId: string,
  userId: string
): { game: DameGame; convId: string } | null {
  if (!gameId || !userId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.* FROM dame_games g
         JOIN conversation_participants p ON p.conversation_id = g.conv_id
        WHERE g.id = ? AND p.user_id = ?
        LIMIT 1`
    )
    .get(gameId, userId) as any;
  if (!row) return null;
  return { game: parseDameRow(row), convId: row.conv_id };
}

// ============ Talk2Me #416 (Pascal 2026-06-05) — Find-or-create + pause/resume ============
// Pascal verbatim : "Comme ça on a pas fini, on reprend là où on s'est arrêté.
// On peut aussi reprendre une partie fraîche."
//
// Doctrine [[talktome-produit-abouti]] : la partie en cours est PERSISTANTE,
// reprise transparente possible entre 2 humains OU avec Léa.

type GameTable = 'chess_games' | 'dame_games';

/**
 * Cherche une partie 'in_progress' (peut être pausée) entre 2 user_ids dans
 * une conversation donnée. Sert à la détection "partie en cours" avant de
 * proposer "Reprendre / Nouvelle partie".
 *
 * Si convId est fourni, restreint à cette conv ; sinon cherche dans tout
 * l'historique entre les 2 users (utile pour mode arbitre qui doit retrouver
 * une partie déjà ouverte dans la même conv P2P).
 */
export function getInProgressGameBetween(
  table: GameTable,
  userA: string,
  userB: string,
  convId?: string
): ChessGame | DameGame | null {
  if (!userA || !userB || userA === userB) return null;
  const db = getDb();
  const sql = `
    SELECT * FROM ${table}
     WHERE status = 'in_progress'
       AND (
         (player_white = ? AND player_black = ?)
         OR (player_white = ? AND player_black = ?)
       )
       ${convId ? 'AND conv_id = ?' : ''}
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const params = convId
    ? [userA, userB, userB, userA, convId]
    : [userA, userB, userB, userA];
  const row = db.prepare(sql).get(...params) as any;
  if (!row) return null;
  return table === 'chess_games' ? parseChessRow(row) : parseDameRow(row);
}

/**
 * Cherche une partie 'in_progress' de cet user contre Léa (LEA_PLAYER_ID).
 * Si convId fourni → restreint à cette conv (cas mode solo : conv agent du
 * user).
 */
export function getInProgressGameForUser(
  table: GameTable,
  userId: string,
  convId?: string
): ChessGame | DameGame | null {
  if (!userId) return null;
  const db = getDb();
  const LEA = 'lea';
  const sql = `
    SELECT * FROM ${table}
     WHERE status = 'in_progress'
       AND (
         (player_white = ? AND player_black = ?)
         OR (player_white = ? AND player_black = ?)
       )
       ${convId ? 'AND conv_id = ?' : ''}
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const params = convId
    ? [userId, LEA, LEA, userId, convId]
    : [userId, LEA, LEA, userId];
  const row = db.prepare(sql).get(...params) as any;
  if (!row) return null;
  return table === 'chess_games' ? parseChessRow(row) : parseDameRow(row);
}

/** Marque la partie en pause (idempotent). */
export function pauseGame(table: GameTable, gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE ${table} SET paused_at = ? WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

/** Reprend la partie (clear paused_at). Idempotent. */
export function resumeGame(table: GameTable, gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE ${table} SET paused_at = NULL WHERE id = ? AND status = 'in_progress'`
    )
    .run(gameId);
  return r.changes > 0;
}

/**
 * Abandonne (status = 'abandoned' via white_won/black_won) une partie pour
 * permettre l'ouverture d'une nouvelle. Utilisé par find-or-create?force_new=true.
 * Sentinel winner='abandoned' n'existe pas dans le schema ; on use 'draw' avec
 * winner null pour ne pas attribuer victoire abusive. C'est une convention :
 * "abandonnée sans winner".
 */
export function abandonChessGame(gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE chess_games SET status = 'draw', winner = NULL, ended_at = ?, paused_at = NULL
         WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

export function abandonDameGame(gameId: string): boolean {
  if (!gameId) return false;
  const db = getDb();
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE dame_games SET status = 'draw', winner = NULL, ended_at = ?, paused_at = NULL
         WHERE id = ? AND status = 'in_progress'`
    )
    .run(now, gameId);
  return r.changes > 0;
}

/**
 * Retourne le timestamp du dernier coup joué dans une partie (basé sur
 * started_at + nb de moves * dt approximatif est faux ; on relit le row pour
 * `ended_at` à défaut, mais le vrai "last move time" n'est pas stocké).
 * Pour la phase 5 GameInviteCard "Dernier coup : il y a 2 heures", on
 * approxime via paused_at si présent, sinon started_at (acceptable MVP).
 */
export function getGameLastActivityTs(g: ChessGame | DameGame): number {
  return g.paused_at || g.ended_at || g.started_at;
}

