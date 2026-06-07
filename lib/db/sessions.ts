// /lib/db/sessions.ts — Magic links (passwordless) + sessions.

import { randomUUID, randomBytes } from 'crypto';
import { getDb } from './_core';
import { parseUserRow, type DbUser } from './users';

export interface DbSession {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface DbMagicLink {
  token: string;
  email: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

export interface MagicLinkConsumed {
  email: string;
  user_id: string | null;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ===================== Magic Links =====================

/**
 * Crée un magic link pour `email`. Si `userId` est fourni (user existant),
 * on associe le token au user direct (signin) ; sinon, le user sera créé
 * à la vérification (signup unifié).
 * Token = 32 bytes random → base64url (~43 chars), validité 15 min.
 */
export function createMagicLink(
  email: string,
  userId?: string | null,
): { token: string; expires_at: number } {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) throw new Error('email_required');
  const db = getDb();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + MAGIC_LINK_TTL_MS;
  db.prepare(
    'INSERT INTO magic_links (token, email, user_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)'
  ).run(token, cleanEmail, userId ?? null, now, expires);
  return { token, expires_at: expires };
}

/**
 * Consomme un magic link. Retourne {email, user_id?} si valide (non utilisé,
 * non expiré), null sinon. Marque used_at pour empêcher réutilisation.
 * Atomique via transaction (lecture + update).
 */
export function consumeMagicLink(token: string): MagicLinkConsumed | null {
  if (!token) return null;
  const db = getDb();
  const tx = db.transaction((tok: string): MagicLinkConsumed | null => {
    const row = db
      .prepare('SELECT * FROM magic_links WHERE token = ?')
      .get(tok) as any;
    if (!row) return null;
    if (row.used_at !== null && row.used_at !== undefined) return null;
    if (typeof row.expires_at !== 'number' || row.expires_at <= Date.now()) {
      return null;
    }
    db.prepare('UPDATE magic_links SET used_at = ? WHERE token = ?').run(
      Date.now(),
      tok,
    );
    return {
      email: row.email,
      user_id: typeof row.user_id === 'string' ? row.user_id : null,
    };
  });
  return tx(token);
}

/**
 * Purge les magic links expirés ou utilisés depuis plus de 24h (housekeeping).
 */
export function purgeExpiredMagicLinks(): number {
  const db = getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const r = db
    .prepare('DELETE FROM magic_links WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)')
    .run(Date.now(), cutoff);
  return r.changes;
}

// ===================== Sessions =====================

export function createSession(userId: string): DbSession {
  const db = getDb();
  const token = randomUUID();
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, expires);
  return { token, user_id: userId, created_at: now, expires_at: expires };
}

export function getSessionUser(token: string): DbUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as any;
  if (!row) return null;
  // Touch last_seen (optionnel)
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), row.id);
  return parseUserRow(row);
}

export function deleteSession(token: string): void {
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function purgeExpiredSessions(): number {
  const db = getDb();
  const r = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  return r.changes;
}
