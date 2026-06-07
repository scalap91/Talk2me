/**
 * Helpers DB pour fuzz_regression et fuzz_run.
 *
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] : un bug détecté = une ligne
 * en DB. Si re-détecté → increment fail_count. Si la suite repasse → status
 * passe à 'fixed' et pass_count++.
 *
 * Le fichier doit être loadable en standalone (script Node) sans middleware
 * Next.js — on tape directement better-sqlite3 ici.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/talktome.db');

let _db = null;
export function getFuzzDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    // Best-effort : si tables fuzz n'existent pas (cas où le serveur Next
    // n'a pas tourné depuis la migration), on crée.
    _db.exec(`
      CREATE TABLE IF NOT EXISTS fuzz_regression (
        id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        prompt TEXT NOT NULL,
        expected_intent TEXT,
        expected_tool TEXT,
        expected_card_kind TEXT,
        forbidden_patterns TEXT,
        required_patterns TEXT,
        first_seen_at INTEGER NOT NULL,
        last_pass_at INTEGER,
        last_fail_at INTEGER,
        fail_count INTEGER DEFAULT 0,
        pass_count INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        last_fail_reason TEXT,
        last_response_excerpt TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fuzz_regression_unique
        ON fuzz_regression(profile, prompt);

      CREATE TABLE IF NOT EXISTS fuzz_run (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        profiles_run TEXT NOT NULL,
        total_prompts INTEGER,
        pass_count INTEGER,
        fail_count INTEGER,
        report_md_path TEXT,
        rate_limit_ms INTEGER,
        side_effects TEXT
      );
    `);
  }
  return _db;
}

/**
 * Enregistre un FAIL (ou increment si existe).
 */
export function recordFail(args) {
  const {
    profile, prompt, expected_intent, expected_tool, expected_card_kind,
    forbidden_patterns, required_patterns, reason, responseExcerpt,
  } = args;
  const db = getFuzzDb();
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id, fail_count, status FROM fuzz_regression WHERE profile = ? AND prompt = ?'
  ).get(profile, prompt);
  if (existing) {
    db.prepare(
      `UPDATE fuzz_regression SET
         fail_count = fail_count + 1,
         last_fail_at = ?,
         last_fail_reason = ?,
         last_response_excerpt = ?,
         status = CASE WHEN status = 'fixed' THEN 'open' ELSE status END
       WHERE id = ?`
    ).run(now, reason, (responseExcerpt || '').slice(0, 500), existing.id);
    return existing.id;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO fuzz_regression (
       id, profile, prompt, expected_intent, expected_tool, expected_card_kind,
       forbidden_patterns, required_patterns, first_seen_at, last_fail_at,
       fail_count, status, last_fail_reason, last_response_excerpt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'open', ?, ?)`
  ).run(
    id, profile, prompt,
    expected_intent || null, expected_tool || null, expected_card_kind || null,
    JSON.stringify(forbidden_patterns || []),
    JSON.stringify(required_patterns || []),
    now, now, reason, (responseExcerpt || '').slice(0, 500)
  );
  return id;
}

/**
 * Enregistre un PASS sur un test connu (increment pass_count, status → fixed
 * si on avait au moins 1 fail).
 */
export function recordPass(args) {
  const { profile, prompt } = args;
  const db = getFuzzDb();
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id, fail_count FROM fuzz_regression WHERE profile = ? AND prompt = ?'
  ).get(profile, prompt);
  if (!existing) return null; // pas connu = on n'archive pas les pass
  db.prepare(
    `UPDATE fuzz_regression SET
       pass_count = pass_count + 1,
       last_pass_at = ?,
       status = CASE WHEN fail_count > 0 AND status = 'open' THEN 'fixed' ELSE status END
     WHERE id = ?`
  ).run(now, existing.id);
  return existing.id;
}

export function listOpenBugs(limit = 100) {
  const db = getFuzzDb();
  return db.prepare(
    `SELECT * FROM fuzz_regression
       WHERE status = 'open' AND fail_count > 0
       ORDER BY fail_count DESC, last_fail_at DESC
       LIMIT ?`
  ).all(limit);
}

export function listAllBugs(limit = 500) {
  const db = getFuzzDb();
  return db.prepare(
    `SELECT * FROM fuzz_regression ORDER BY fail_count DESC, last_fail_at DESC LIMIT ?`
  ).all(limit);
}

export function createRun(args) {
  const { profiles, rateLimit } = args;
  const db = getFuzzDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO fuzz_run (id, started_at, profiles_run, rate_limit_ms)
     VALUES (?, ?, ?, ?)`
  ).run(id, Date.now(), JSON.stringify(profiles), rateLimit || null);
  return id;
}

export function finalizeRun(runId, args) {
  const { total, pass, fail, reportPath, sideEffects } = args;
  const db = getFuzzDb();
  db.prepare(
    `UPDATE fuzz_run SET
       ended_at = ?, total_prompts = ?, pass_count = ?, fail_count = ?,
       report_md_path = ?, side_effects = ?
     WHERE id = ?`
  ).run(
    Date.now(), total, pass, fail, reportPath || null,
    JSON.stringify(sideEffects || {}), runId
  );
}

export function listRuns(limit = 50) {
  const db = getFuzzDb();
  return db.prepare(
    `SELECT * FROM fuzz_run ORDER BY started_at DESC LIMIT ?`
  ).all(limit);
}
