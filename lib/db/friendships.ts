// /lib/db/friendships.ts — Graphe d'amitié (symétrique).

import { randomUUID } from 'crypto';
import { getDb } from './_core';
import { parseUserRow, getUserById, type DbUser } from './users';

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
  const [a, b] = normalizePair(userIdA, userIdB);
  const existing = db
    .prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?')
    .get(a, b) as any;
  if (existing) {
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
  db.prepare(
    'INSERT INTO friendships (id, user_a, user_b, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, a, b, 'accepted', now);
  return { id, user_a: a, user_b: b, status: 'accepted', created_at: now };
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
