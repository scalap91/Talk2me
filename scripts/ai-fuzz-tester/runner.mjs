/**
 * Runner du fuzz : pour chaque prompt d'un profile :
 *  1. Setup user fuzz (créé une fois, réutilisé) + session cookie
 *  2. Reset la conv solo IA pour isoler le contexte
 *  3. POST /api/chat avec le prompt
 *  4. Récupère la réponse (text + cards)
 *  5. Run tous les validators
 *  6. Si fail → recordFail() en DB
 *
 * Doctrine [[feedback-emails-test-blocklist]] : emails fuzz sont
 * fuzz+<uuid>@test.com → bloqués par garde-fou Brevo.
 *
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] : tout est tracé, compteurs
 * tenus, side effects rapportés.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { validateIntent } from './validators/intent.mjs';
import { validateTool } from './validators/tool.mjs';
import { validateCard } from './validators/card.mjs';
import { validateJsonLeak } from './validators/json-leak.mjs';
import { validatePrivacy } from './validators/privacy.mjs';
import { validateConversational } from './validators/conversational.mjs';
import { validateMode } from './validators/mode.mjs';
import { recordFail, recordPass } from './regression-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/talktome.db');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const VALIDATORS = [
  validateIntent,
  validateTool,
  validateCard,
  validateJsonLeak,
  validatePrivacy,
  validateConversational,
  validateMode,
];

let _runnerDb = null;
function db() {
  if (!_runnerDb) {
    _runnerDb = new Database(DB_PATH);
    _runnerDb.pragma('journal_mode = WAL');
    _runnerDb.pragma('foreign_keys = ON');
  }
  return _runnerDb;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Crée (ou récupère) un user fuzz pour un profile donné.
 * Email : fuzz+<profile>-<uuid>@test.com (bloqué Brevo).
 * Talk2Me_id : 6 chiffres random.
 * Crée également la conversation 'agent' associée.
 */
export function setupFuzzUser(profile) {
  const d = db();
  const existing = d.prepare(
    "SELECT * FROM users WHERE username = ?"
  ).get(`fuzz-${profile}`);
  if (existing) {
    // Reset la conv (purge messages pour repartir propre)
    const conv = d.prepare(
      "SELECT id FROM conversations WHERE user_id = ? AND (kind IS NULL OR kind = 'agent') ORDER BY created_at DESC LIMIT 1"
    ).get(existing.id);
    if (conv) {
      d.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conv.id);
    }
    return existing;
  }
  const id = randomUUID();
  const talk2meId = String(Math.floor(100000 + Math.random() * 900000));
  const now = Date.now();
  const username = `fuzz-${profile}`;
  const display = `Fuzz ${profile}`;
  const email = `fuzz+${profile}-${randomUUID().slice(0, 8)}@test.com`;
  const aiName = `T2M de ${display}`;
  d.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  ).run(id, talk2meId, username, display, email, now, now, aiName);
  // Crée la conv 'agent' (solo IA)
  const convId = randomUUID();
  d.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
  ).run(convId, id, now, id);
  d.prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(convId, id, now);
  return d.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * Crée une session pour ce user. Retourne le token cookie.
 */
export function createFuzzSession(userId) {
  const d = db();
  const token = randomUUID();
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  d.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, expires);
  return token;
}

/**
 * Clean session token après usage (optionnel — sinon TTL 30j).
 */
export function dropFuzzSession(token) {
  const d = db();
  d.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Envoie un prompt à /api/chat et retourne la réponse + métadonnées.
 *
 * Compte les écritures DB (messages créés) en BEFORE/AFTER pour le compteur
 * de side effects (doctrine [[feedback-fuzz-rapport-obligatoire]]).
 */
export async function sendPrompt(args) {
  const { baseUrl, token, prompt, timeoutMs } = args;
  const d = db();
  const beforeMessages = d.prepare('SELECT COUNT(*) AS c FROM messages').get().c;

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 45000);
  let resp = null;
  let err = null;
  let httpStatus = 0;
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `talk2me_session=${token}`,
        'x-talktome-mode': prompt.mode || 'chat',
      },
      body: JSON.stringify({
        message: prompt.text,
        mode: prompt.mode || 'chat',
      }),
      signal: ctl.signal,
    });
    httpStatus = r.status;
    const txt = await r.text();
    try { resp = JSON.parse(txt); }
    catch { resp = { text: txt, _raw: true }; }
  } catch (e) {
    err = e.message || String(e);
  } finally {
    clearTimeout(to);
  }

  const afterMessages = d.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const messagesCreated = Math.max(0, afterMessages - beforeMessages);
  return { resp, err, httpStatus, messagesCreated };
}

/**
 * Évalue les validators sur (prompt, response). Retourne :
 *   { allPass: bool, fails: [{name, reason}], passed: [{name, reason}] }
 *
 * Note : on évalue aussi les forbidden_patterns / required_patterns inline
 * (déclarés dans le prompt) — extension simple sans nouveau validator.
 */
export function runValidators(prompt, response) {
  const results = [];
  for (const v of VALIDATORS) {
    if (prompt.skip_validators?.includes(v.name?.replace(/^validate/, '').toLowerCase())) {
      continue;
    }
    try {
      const r = v(prompt, response);
      results.push(r);
    } catch (e) {
      results.push({ name: v.name || 'unknown', pass: false, reason: `validator error: ${e.message}` });
    }
  }
  // Forbidden patterns
  if (prompt.forbidden_patterns?.length) {
    const text = (response.text || '').toString();
    for (const pat of prompt.forbidden_patterns) {
      try {
        const re = new RegExp(pat, 'i');
        if (re.test(text)) {
          results.push({
            name: 'forbidden_pattern',
            pass: false,
            reason: `forbidden pattern matched: /${pat}/`,
          });
        }
      } catch (e) {
        results.push({ name: 'forbidden_pattern', pass: false, reason: `bad regex: ${pat}` });
      }
    }
  }
  // Required patterns
  if (prompt.required_patterns?.length) {
    const text = (response.text || '').toString();
    for (const pat of prompt.required_patterns) {
      try {
        const re = new RegExp(pat, 'i');
        if (!re.test(text)) {
          results.push({
            name: 'required_pattern',
            pass: false,
            reason: `required pattern missing: /${pat}/`,
          });
        }
      } catch (e) {
        results.push({ name: 'required_pattern', pass: false, reason: `bad regex: ${pat}` });
      }
    }
  }

  const fails = results.filter((r) => !r.pass);
  const passed = results.filter((r) => r.pass);
  return { allPass: fails.length === 0, fails, passed, total: results.length };
}

/**
 * Exécute un profile entier. Pour chaque prompt :
 *  - sendPrompt
 *  - runValidators
 *  - recordFail si fail / recordPass si on connaissait ce bug et il passe
 *
 * Retourne stats agrégées + détails (pour rapport MD).
 */
export async function runProfile(args) {
  const { profile, count, baseUrl, rateLimitMs, onProgress } = args;
  const user = setupFuzzUser(profile.name);
  const token = createFuzzSession(user.id);
  const prompts = profile.generate(count);
  const results = [];
  let pass = 0, fail = 0, totalMessagesCreated = 0, httpErrors = 0;

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    // Cleanup conv avant chaque prompt pour isoler contexte
    try {
      const conv = db().prepare(
        "SELECT id FROM conversations WHERE user_id = ? AND (kind IS NULL OR kind = 'agent') ORDER BY created_at DESC LIMIT 1"
      ).get(user.id);
      if (conv) {
        db().prepare('DELETE FROM messages WHERE conversation_id = ?').run(conv.id);
      }
    } catch {}

    const t0 = Date.now();
    const { resp, err, httpStatus, messagesCreated } = await sendPrompt({
      baseUrl, token, prompt: p,
    });
    const elapsed = Date.now() - t0;
    totalMessagesCreated += messagesCreated;

    let val = { allPass: false, fails: [{ name: 'http', reason: err || `HTTP ${httpStatus}` }], passed: [], total: 1 };
    if (resp && httpStatus < 400) {
      val = runValidators(p, resp);
    } else {
      httpErrors++;
    }

    if (val.allPass) {
      pass++;
      // Si on connaissait ce bug, mark fixed
      recordPass({ profile: profile.name, prompt: p.text });
    } else {
      fail++;
      const reason = val.fails.map((f) => `[${f.name}] ${f.reason}`).join(' | ');
      const excerpt = ((resp && resp.text) || '').toString().slice(0, 500);
      recordFail({
        profile: profile.name,
        prompt: p.text,
        expected_intent: p.expected_intent,
        expected_tool: p.expected_tool,
        expected_card_kind: p.expected_card_kind,
        forbidden_patterns: p.forbidden_patterns,
        required_patterns: p.required_patterns,
        reason, responseExcerpt: excerpt,
      });
    }

    results.push({
      idx: i + 1,
      prompt: p.text,
      expected: {
        intent: p.expected_intent,
        tool: p.expected_tool,
        card: p.expected_card_kind,
      },
      pass: val.allPass,
      fails: val.fails,
      passed_count: val.passed.length,
      total_validators: val.total,
      elapsed_ms: elapsed,
      http_status: httpStatus,
      text_excerpt: ((resp && resp.text) || '').toString().slice(0, 200),
      messagesCreated,
    });

    if (onProgress) onProgress({ profile: profile.name, idx: i + 1, total: prompts.length, pass, fail });
    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }

  dropFuzzSession(token);
  return {
    profile: profile.name,
    description: profile.description,
    user_id: user.id,
    total: prompts.length,
    pass, fail, httpErrors,
    messagesCreated: totalMessagesCreated,
    results,
  };
}
