/**
 * Talk2Me #406 — Pont vers Léa (Pascal 2026-06-05).
 *
 * Utilitaires pour :
 *  - créer / réutiliser un fake user "ai-ops-fuzz" isolé
 *  - créer une session pour appeler /api/chat avec un cookie valide
 *  - reset la conversation entre cycles
 *  - cleanup massif (purge users + convs + messages)
 *
 * Doctrine [[talk2me-pii-air-gap]] : ces users sont DÉDIÉS aux tests AI Ops.
 * Emails : ai-ops-fuzz+<uuid>@test.com → bloqués par garde-fou Brevo.
 *
 * Doctrine [[feedback-emails-test-blocklist]] : @test.com bloqué en sortie.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const DB_PATH = process.cwd() + '/data/talktome.db';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export const AI_OPS_USERNAME_PREFIX = 'ai-ops-fuzz-';

export interface FakeUser {
  id: string;
  username: string;
  email: string;
  talk2me_id: string;
}

/** Crée un fake user pour le cycle (ou réutilise le pool si max atteint). */
export function getOrCreateFakeUser(): FakeUser {
  const d = db();
  // Pool de max 5 fake users tournants (évite explosion DB sur long terme)
  const existing = d
    .prepare(
      `SELECT id, username, email, talk2me_id FROM users
       WHERE username LIKE ?
       ORDER BY last_seen ASC NULLS FIRST
       LIMIT 1`,
    )
    .get(AI_OPS_USERNAME_PREFIX + '%') as FakeUser | undefined;

  const count = (
    d
      .prepare(
        `SELECT COUNT(*) AS c FROM users WHERE username LIKE ?`,
      )
      .get(AI_OPS_USERNAME_PREFIX + '%') as { c: number }
  ).c;

  if (existing && count >= 5) {
    // Réutilise : reset sa conv et touch last_seen
    const conv = d
      .prepare(
        "SELECT id FROM conversations WHERE user_id = ? AND (kind IS NULL OR kind = 'agent') ORDER BY created_at DESC LIMIT 1",
      )
      .get(existing.id) as { id: string } | undefined;
    if (conv) {
      d.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conv.id);
    }
    d.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(
      Date.now(),
      existing.id,
    );
    return existing;
  }

  // Crée nouveau
  const id = randomUUID();
  const uuid8 = randomUUID().slice(0, 8);
  const username = AI_OPS_USERNAME_PREFIX + uuid8;
  const email = `ai-ops-fuzz+${uuid8}@test.com`;
  const talk2meId = String(Math.floor(100000 + Math.random() * 900000));
  const now = Date.now();
  d.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    talk2meId,
    username,
    `AI Ops ${uuid8}`,
    email,
    now,
    now,
    `Léa AIOps`,
  );

  const convId = randomUUID();
  d.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)",
  ).run(convId, id, now, id);
  d.prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)',
  ).run(convId, id, now);

  return { id, username, email, talk2me_id: talk2meId };
}

/** Crée un token session pour ce fake user. */
export function createFakeSession(userId: string): string {
  const d = db();
  const token = randomUUID();
  const now = Date.now();
  d.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

export interface LeaResponse {
  text: string;
  toolCallsSummary: string[];
  attachedCardsKinds: string[];
  httpStatus: number;
  error: string | null;
  rawJson: Record<string, unknown> | null;
}

/** POST /api/chat avec le cookie de session. */
export async function callLea(args: {
  baseUrl: string;
  sessionToken: string;
  message: string;
  timeoutMs?: number;
}): Promise<LeaResponse> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), args.timeoutMs || 45000);
  let resp: Record<string, unknown> | null = null;
  let err: string | null = null;
  let httpStatus = 0;
  try {
    const r = await fetch(`${args.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `talk2me_session=${args.sessionToken}`,
        'x-talktome-mode': 'chat',
      },
      body: JSON.stringify({ message: args.message, mode: 'chat' }),
      signal: ctl.signal,
    });
    httpStatus = r.status;
    const txt = await r.text();
    try {
      resp = JSON.parse(txt) as Record<string, unknown>;
    } catch {
      resp = { text: txt, _raw: true };
    }
  } catch (e) {
    err = (e as Error).message;
  } finally {
    clearTimeout(to);
  }

  const text = String((resp?.text as string) || '');
  // Extract tool call types — Talk2Me shape : youtube/recipe/places/etc.
  const toolCallsSummary: string[] = [];
  const cardKindsHinted = ['youtube', 'places', 'placeSearch', 'recipe', 'products', 'tiktok', 'wikipedia', 'weather', 'webSearch'];
  for (const k of cardKindsHinted) {
    if (resp && resp[k] !== undefined && resp[k] !== null) {
      toolCallsSummary.push(k);
    }
  }
  const attachedCardsKinds = [...toolCallsSummary];

  return {
    text,
    toolCallsSummary,
    attachedCardsKinds,
    httpStatus,
    error: err,
    rawJson: resp,
  };
}

/** Purge tous les fake users + leurs convs/messages + sessions. */
export function cleanupFakeUsers(): {
  users: number;
  conversations: number;
  messages: number;
  sessions: number;
} {
  const d = db();
  // Récupère les ids
  const ids = (
    d
      .prepare('SELECT id FROM users WHERE username LIKE ?')
      .all(AI_OPS_USERNAME_PREFIX + '%') as { id: string }[]
  ).map((r) => r.id);

  if (ids.length === 0) {
    return { users: 0, conversations: 0, messages: 0, sessions: 0 };
  }
  const placeholders = ids.map(() => '?').join(',');

  const convIds = (
    d
      .prepare(`SELECT id FROM conversations WHERE user_id IN (${placeholders})`)
      .all(...ids) as { id: string }[]
  ).map((r) => r.id);

  const convPh = convIds.length ? convIds.map(() => '?').join(',') : null;
  let msgCount = 0;
  if (convPh) {
    msgCount = (
      d
        .prepare(`SELECT COUNT(*) AS c FROM messages WHERE conversation_id IN (${convPh})`)
        .get(...convIds) as { c: number }
    ).c;
    d.prepare(`DELETE FROM messages WHERE conversation_id IN (${convPh})`).run(...convIds);
    d.prepare(
      `DELETE FROM conversation_participants WHERE conversation_id IN (${convPh})`,
    ).run(...convIds);
    d.prepare(`DELETE FROM conversations WHERE id IN (${convPh})`).run(...convIds);
  }

  const sessCount = (
    d
      .prepare(`SELECT COUNT(*) AS c FROM sessions WHERE user_id IN (${placeholders})`)
      .get(...ids) as { c: number }
  ).c;
  d.prepare(`DELETE FROM sessions WHERE user_id IN (${placeholders})`).run(...ids);

  // ai_memories / user_habits si présent
  try {
    d.prepare(`DELETE FROM ai_memories WHERE user_id IN (${placeholders})`).run(...ids);
  } catch {}
  try {
    d.prepare(`DELETE FROM user_habits WHERE user_id IN (${placeholders})`).run(...ids);
  } catch {}
  try {
    d.prepare(`DELETE FROM route_learnings WHERE user_id IN (${placeholders})`).run(...ids);
  } catch {}

  d.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);

  return {
    users: ids.length,
    conversations: convIds.length,
    messages: msgCount,
    sessions: sessCount,
  };
}
