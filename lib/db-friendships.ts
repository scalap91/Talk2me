/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-friendships — domaine « friendships » (amis : demandes, accept/refus,
 * listes, compteurs) extrait de lib/db.ts (decoupage #53/db-core, Pascal 2026-06-30).
 * Primitives via @/lib/db-core ; getUserById cross-domaine via facade. Re-exporte par db.ts.
 */
import { randomUUID } from 'crypto';
import { getDb, parseUserRow } from '@/lib/db-core';
import type { DbUser } from '@/lib/db-core';
import { getUserById } from '@/lib/db'; // cross-domaine (users), facade lazy

// ============ friendships ============
// /lib/db/friendships.ts — Graphe d'amitié (symétrique).


export interface DbFriendship {
  id: string;
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: number;
}

/** Normalise une paire d'IDs (user_a < user_b lexicographiquement). */
function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Crée une amitié (symétrique). Retourne la friendship existante si déjà créée.
 * Impossible d'être ami avec soi-même.
 */
export function addFriend(userIdA: string, userIdB: string): DbFriendship {
  if (!userIdA || !userIdB) throw new Error('user ids required');
  if (userIdA === userIdB) throw new Error('cannot_friend_self');
  const db = getDb();
  // Sanity : les 2 users existent
  if (!getUserById(userIdA) || !getUserById(userIdB)) {
    throw new Error('user_not_found');
  }
  const requester = userIdA; // celui qui lance la demande
  const [a, b] = normalizePair(userIdA, userIdB);
  const existing = db
    .prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?')
    .get(a, b) as any;
  if (existing) {
    // Demande inverse déjà en attente (l'AUTRE m'avait invité) → on accepte direct.
    if (existing.status === 'pending' && existing.requested_by && existing.requested_by !== requester) {
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
      return { id: existing.id, user_a: existing.user_a, user_b: existing.user_b, status: 'accepted', created_at: existing.created_at };
    }
    return {
      id: existing.id,
      user_a: existing.user_a,
      user_b: existing.user_b,
      status: existing.status,
      created_at: existing.created_at,
    };
  }
  const id = randomUUID();
  const now = Date.now();
  // Nouvelle DEMANDE en attente (le destinataire doit accepter). Plus d'ajout instantané.
  db.prepare(
    'INSERT INTO friendships (id, user_a, user_b, status, created_at, requested_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, a, b, 'pending', now, requester);
  return { id, user_a: a, user_b: b, status: 'pending', created_at: now };
}

/** Le destinataire ACCEPTE une demande d'ami (seul lui peut, pas l'initiateur). */
export function acceptFriend(userId: string, otherId: string): boolean {
  if (!userId || !otherId) return false;
  const db = getDb();
  const [a, b] = normalizePair(userId, otherId);
  const r = db
    .prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by IS NOT NULL AND requested_by != ?")
    .run(a, b, userId);
  return r.changes > 0;
}

/** Le destinataire REFUSE une demande d'ami → on supprime la ligne pending. */
export function declineFriend(userId: string, otherId: string): boolean {
  if (!userId || !otherId) return false;
  const db = getDb();
  const [a, b] = normalizePair(userId, otherId);
  const r = db
    .prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by != ?")
    .run(a, b, userId);
  return r.changes > 0;
}

/** Demandes d'ami REÇUES par userId (pending, initiées par quelqu'un d'autre).
 *  Retourne l'autre user (l'initiateur) + la date de demande. */
export function listIncomingFriendRequests(userId: string): Array<DbUser & { requested_at: number }> {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.requested_by AS rid, f.created_at AS req_at
         FROM friendships f
        WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending'
          AND f.requested_by IS NOT NULL AND f.requested_by != ?
        ORDER BY f.created_at DESC`
    )
    .all(userId, userId, userId) as { rid: string; req_at: number }[];
  const out: Array<DbUser & { requested_at: number }> = [];
  for (const r of rows) {
    const u = getUserById(r.rid);
    if (u) out.push({ ...u, requested_at: r.req_at });
  }
  return out;
}

/** Nb de demandes d'ami en attente (pour pastille). */
export function countIncomingFriendRequests(userId: string): number {
  if (!userId) return 0;
  return (getDb()
    .prepare("SELECT COUNT(*) c FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'pending' AND requested_by IS NOT NULL AND requested_by != ?")
    .get(userId, userId, userId) as { c: number }).c;
}

/** Supprime une amitié (symétrique). Retourne true si une ligne a été supprimée. */
export function removeFriend(userIdA: string, userIdB: string): boolean {
  if (!userIdA || !userIdB) return false;
  const db = getDb();
  const [a, b] = normalizePair(userIdA, userIdB);
  const r = db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
  return r.changes > 0;
}

/** Liste les amis d'un user (status = accepted). Retourne le User "autre". */
export function listFriends(userId: string): DbUser[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.* FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
         ORDER BY f.created_at DESC`
    )
    .all(userId, userId, userId) as any[];
  return rows.map(parseUserRow);
}

/**
 * Talk2Me PII security (Pascal 2026-06-05) — IDs uniquement des amis acceptés.
 * Helper pour scoper les recherches de l'IA T2M Officiel : current user + amis
 * sont les seuls users visibles. Le reste de la DB est INVISIBLE pour l'IA.
 * Doctrine [[talk2me-pii-security]].
 */
export function listFriendIds(userId: string): string[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS friend_id
         FROM friendships
         WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'`
    )
    .all(userId, userId, userId) as Array<{ friend_id: string }>;
  return rows.map((r) => r.friend_id);
}

/** Vérifie si 2 users sont amis (status accepted). */
export function isFriend(userIdA: string, userIdB: string): boolean {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const db = getDb();
  const [a, b] = normalizePair(userIdA, userIdB);
  const row = db
    .prepare("SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted' LIMIT 1")
    .get(a, b);
  return !!row;
}

/** Compte les amis acceptés d'un user. */
export function countFriends(userId: string): number {
  if (!userId) return 0;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'"
    )
    .get(userId, userId) as { c?: number } | undefined;
  return row?.c ?? 0;
}

