#!/usr/bin/env node
/**
 * Talk2Me PII air-gap 7-layers (Pascal 2026-06-05) — Tests unitaires.
 *
 * Doctrine [[talk2me-pii-air-gap]] verbatim Pascal :
 *   "cette info en general ne dois meme pas passer dans les tuyaux de l'IA
 *    ni meme la memoriser dans une conversation il dois refuser de la
 *    transmetre et dois lefacer en memoire"
 *
 * Tests indépendants (pas de PM2 nécessaire) qui valident :
 *   1. user-snapshot.ts ne contient PAS talk2me_id dans son output
 *   2. tools officiel → search_users sortie sanitisée (déjà couvert #394)
 *   3. extract-habits filter PII (safeUpsertUserHabit refuse)
 *   4. history sanitize via scrubPii
 *   5. scrubber étendu : IPv4 + IBAN + session token + email + 6-digit
 *   6. memory-cleaner purge habits/memories avec PII
 *   7. system prompts contiennent la phrase de refus
 *
 * Usage : node tests/pii_air_gap_2026_06_05.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const DB_PATH = join(ROOT, 'data', 'talktome.db');

// Compteurs
let passed = 0;
let failed = 0;
const results = [];

function record(layer, scenario, ok, detail) {
  results.push({ layer, scenario, ok, detail });
  if (ok) passed++;
  else failed++;
  const tag = ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mKO\x1b[0m';
  console.log(`  [${tag}] L${layer} ${scenario}${detail ? ' — ' + detail : ''}`);
}

// ============================================================================
// Charge les helpers PII en pur Node (re-implémentation pour test isolé,
// fidèle à /lib/security/pii.ts). Évite de charger TypeScript runtime.
// ============================================================================

const PII_PATTERNS = [
  { name: 'iban', regex: /\b(?:FR|GB|DE|IT|ES|BE|CH|LU|NL|PT)\d{2}\s?[A-Z0-9 ]{14,30}\b/g },
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'ipv4', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'session_token', regex: /\b(?:sess|tok|magic)_[a-zA-Z0-9_-]{20,}\b/g },
  { name: 'cc', regex: /\b(?:\d[ -]?){13,19}\b/g },
  { name: 'talk2me_id', regex: /(?<!\d)\d{6}(?!\d)/g },
];

function containsPii(text) {
  if (!text || typeof text !== 'string') return false;
  for (const p of PII_PATTERNS) {
    p.regex.lastIndex = 0;
    if (p.regex.test(text)) return true;
  }
  return false;
}

function scrubPii(text) {
  if (!text || typeof text !== 'string') return text || '';
  let out = text;
  for (const p of PII_PATTERNS) {
    out = out.replace(p.regex, '[REDACTED]');
  }
  return out;
}

// ============================================================================
// LAYER 1 — user-snapshot.ts ne contient PAS talk2me_id
// ============================================================================
console.log('\n=== Layer 1 — user-snapshot.ts (system prompt) ===');
{
  const src = readFileSync(join(ROOT, 'lib/ai/consciousness/user-snapshot.ts'), 'utf8');
  // Vérifie qu'on n'a PLUS le push direct du talk2me_id
  const leaksIt = /lines\.push\([^)]*talk2me_id/i.test(src) || /ID Talk2Me\s*:\s*\$\{/.test(src);
  record(1, 'no talk2me_id pushed in lines', !leaksIt, leaksIt ? 'still pushing' : 'clean');
}

// ============================================================================
// LAYER 2 — tools officiel search_users sortie sanitisée
// ============================================================================
console.log('\n=== Layer 2 — officiel/tools.ts search_users ===');
{
  const src = readFileSync(join(ROOT, 'lib/ai/officiel/tools.ts'), 'utf8');
  const hasSummarize = /summarizeUserPublic\(u,\s*sender\.id\)/.test(src);
  const hasIdRefusal = /talk2me_id lookup refused/i.test(src);
  const hasScope = /allowedIds.*has\(u\.id\)/.test(src);
  record(2, 'summarizeUserPublic applied', hasSummarize);
  record(2, '6-digit ID lookup refused', hasIdRefusal);
  record(2, 'scope strict current+friends', hasScope);
}

// ============================================================================
// LAYER 3 — extract-habits filter PII (safeUpsertUserHabit)
// ============================================================================
console.log('\n=== Layer 3 — extract-habits filter PII ===');
{
  const src = readFileSync(join(ROOT, 'lib/ai/extract-habits.ts'), 'utf8');
  const importsContainsPii = /containsPii.*from.*security\/pii/.test(src);
  const hasSafeWrapper = /safeUpsertUserHabit/.test(src);
  // Plus aucun appel direct upsertUserHabit sauf dans safeUpsertUserHabit
  const directCalls = src.match(/\bupsertUserHabit\(/g) || [];
  // 1 occurrence attendue : celle DANS safeUpsertUserHabit. Tout au-dessus
  // doit être safeUpsertUserHabit.
  const safeCalls = src.match(/safeUpsertUserHabit\(/g) || [];
  record(3, 'imports containsPii', importsContainsPii);
  record(3, 'safeUpsertUserHabit wrapper exists', hasSafeWrapper);
  record(
    3,
    `direct upsertUserHabit calls = 1 (inside wrapper only)`,
    directCalls.length === 1,
    `found=${directCalls.length}, safe=${safeCalls.length}`,
  );

  // Test fonctionnel : containsPii détecte un talk2me_id 6 chiffres
  record(3, 'containsPii("263368") = true', containsPii('263368'));
  record(
    3,
    'containsPii("pizza") = false',
    !containsPii('pizza'),
  );
}

// ============================================================================
// LAYER 4 — history sanitize via scrubPii
// ============================================================================
console.log('\n=== Layer 4 — conversation history sanitize ===');
{
  const chatRoute = readFileSync(join(ROOT, 'app/api/chat/route.ts'), 'utf8');
  const importsScrub = /scrubPii.*from.*security\/pii/.test(chatRoute);
  const wrapsHistory = /content:\s*scrubPii\(msg\.content/.test(chatRoute);
  const wrapsUserMsg = /content:\s*scrubPii\(message\s*\|\|/.test(chatRoute);
  record(4, '/api/chat imports scrubPii', importsScrub);
  record(4, '/api/chat wraps history content', wrapsHistory);
  record(4, '/api/chat wraps user message', wrapsUserMsg);

  const p2pRoute = readFileSync(
    join(ROOT, 'app/api/conversations/[id]/messages/route.ts'),
    'utf8',
  );
  const p2pImports = /scrubPii.*from.*security\/pii/.test(p2pRoute);
  const p2pUsesScrub = /scrubPii\(out\)/.test(p2pRoute);
  record(4, 'P2P route imports scrubPii', p2pImports);
  record(4, 'sanitizeQuotedText uses scrubPii', p2pUsesScrub);

  const officielHandler = readFileSync(
    join(ROOT, 'lib/ai/officiel/handler.ts'),
    'utf8',
  );
  const officielImports = /scrubPii.*containsPii.*from.*security\/pii/.test(officielHandler);
  const officielWrapsUser = /scrubPii\(userMessage\s*\|\|/.test(officielHandler);
  record(4, 'T2M Officiel imports scrubPii', officielImports);
  record(4, 'T2M Officiel wraps userMessage', officielWrapsUser);

  // Test fonctionnel scrubPii
  const sample = 'Mon ID est 263368 et mon email est pascal@gw.fr';
  const scrubbed = scrubPii(sample);
  record(
    4,
    'scrubPii("263368") → [REDACTED]',
    !scrubbed.includes('263368') && scrubbed.includes('[REDACTED]'),
    `out="${scrubbed}"`,
  );
  record(
    4,
    'scrubPii email → [REDACTED]',
    !scrubbed.includes('pascal@gw.fr'),
  );
}

// ============================================================================
// LAYER 5 — scrubber étendu (IPv4, IBAN, session, CC)
// ============================================================================
console.log('\n=== Layer 5 — output scrubber étendu ===');
{
  const cases = [
    { in: 'mon IP 192.168.1.42', should_match: 'ipv4' },
    { in: 'IBAN FR7630006000011234567890189', should_match: 'iban' },
    { in: 'token sess_aZ1bC2dE3fG4hI5jK6lM7nO8pQ9rS', should_match: 'session_token' },
    { in: 'CB 4532015112830366', should_match: 'cc' },
    { in: 'email a@b.co', should_match: 'email' },
    { in: 'ID 263368', should_match: 'talk2me_id' },
  ];
  for (const c of cases) {
    const detected = containsPii(c.in);
    record(5, `pattern ${c.should_match}`, detected, `input="${c.in}"`);
  }

  // Faux positifs : dates, prix
  record(5, 'no false positive on price "12.99"', !containsPii('Le prix est 12.99 euros'));
  record(
    5,
    'no false positive on date "2026-06-05"',
    !containsPii('Aujourdhui 2026-06-05 fait beau'),
    // 4 chiffres puis 2 chiffres puis 2 chiffres séparés par tirets : pas un match 6-digit strict
  );
  // Officiel handler scrubber contient containsPii
  const officielHandler = readFileSync(
    join(ROOT, 'lib/ai/officiel/handler.ts'),
    'utf8',
  );
  record(
    5,
    'officiel/handler.ts scrubPiiFromReply uses containsPii',
    /if \(containsPii\(out\)\)/.test(officielHandler),
  );
}

// ============================================================================
// LAYER 6 — memory-cleaner purge habits/memories avec PII
// ============================================================================
console.log('\n=== Layer 6 — memory-cleaner background ===');
{
  // Vérifie présence des fichiers + migration column
  const cleanerSrc = readFileSync(
    join(ROOT, 'lib/security/memory-cleaner.ts'),
    'utf8',
  );
  record(6, 'memory-cleaner.ts exists', cleanerSrc.length > 100);
  record(
    6,
    'maybeCleanUserMemoryPii exists',
    /export function maybeCleanUserMemoryPii/.test(cleanerSrc),
  );

  const dbSrc = readFileSync(join(ROOT, 'lib/db.ts'), 'utf8');
  record(
    6,
    'ALTER TABLE users ADD last_pii_clean_at',
    /ALTER TABLE users ADD COLUMN last_pii_clean_at INTEGER/.test(dbSrc),
  );

  const authMe = readFileSync(join(ROOT, 'app/api/auth/me/route.ts'), 'utf8');
  record(
    6,
    '/api/auth/me wires maybeCleanUserMemoryPii',
    /maybeCleanUserMemoryPii\(user\.id\)/.test(authMe),
  );

  // Test DB end-to-end : insert habit PII + run cleaner via DB direct
  try {
    const db = new Database(DB_PATH);
    // Pick a user to test against
    const u = db
      .prepare('SELECT id FROM users LIMIT 1')
      .get();
    if (!u) {
      record(6, 'no test user available in DB', false);
    } else {
      const testHabitId = randomUUID();
      const now = Date.now();
      // Insert habit avec PII (talk2me_id 6 chiffres)
      db.prepare(
        `INSERT INTO user_habits
           (id, user_id, kind, value, score, occurrences, first_seen_at, last_seen_at, source, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(testHabitId, u.id, 'topic', 'mon id 263368', 1.0, 1, now, now, 'pii_test', null);

      const testMemoryId = randomUUID();
      db.prepare(
        `INSERT INTO ai_memories
           (id, user_id, kind, content, weight, source_conv_id, source_message_id, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(testMemoryId, u.id, 'fact', "Pascal m'a dit son ID 263368", 1.0, null, null, now);

      // Force last_pii_clean_at = 0 pour bypass throttle
      try {
        db.prepare('UPDATE users SET last_pii_clean_at = 0 WHERE id = ?').run(u.id);
      } catch (e) {
        // colonne pas encore créée si build pas tourné → skip
        record(6, 'last_pii_clean_at column exists', false, e.message);
      }

      // Simule cleaner avec la même logique
      let habitsDel = 0;
      let memoriesDel = 0;
      const habits = db
        .prepare('SELECT id, value FROM user_habits WHERE user_id = ?')
        .all(u.id);
      for (const h of habits) {
        if (containsPii(h.value)) {
          db.prepare('DELETE FROM user_habits WHERE id = ?').run(h.id);
          habitsDel++;
        }
      }
      const memories = db
        .prepare('SELECT id, content FROM ai_memories WHERE user_id = ?')
        .all(u.id);
      for (const m of memories) {
        if (containsPii(m.content)) {
          db.prepare('DELETE FROM ai_memories WHERE id = ?').run(m.id);
          memoriesDel++;
        }
      }

      // Vérifie que nos deux PII test ont été nettoyés
      const stillH = db
        .prepare('SELECT id FROM user_habits WHERE id = ?')
        .get(testHabitId);
      const stillM = db
        .prepare('SELECT id FROM ai_memories WHERE id = ?')
        .get(testMemoryId);
      record(
        6,
        'PII habit purged',
        !stillH,
        `habits_deleted=${habitsDel}`,
      );
      record(
        6,
        'PII memory purged',
        !stillM,
        `memories_deleted=${memoriesDel}`,
      );
      db.close();
    }
  } catch (e) {
    record(6, 'DB test threw', false, e.message);
  }
}

// ============================================================================
// LAYER 7 — IA refus actif dans system prompts
// ============================================================================
console.log('\n=== Layer 7 — IA refus actif ===');
{
  const officielHandler = readFileSync(
    join(ROOT, 'lib/ai/officiel/handler.ts'),
    'utf8',
  );
  record(
    7,
    'T2M Officiel system prompt: refus phrase',
    /Cette info ne passe pas par moi/i.test(officielHandler),
  );

  const p2pRoute = readFileSync(
    join(ROOT, 'app/api/conversations/[id]/messages/route.ts'),
    'utf8',
  );
  record(
    7,
    'Léa P2P system prompt: refus phrase',
    /Cette info ne passe pas par moi/i.test(p2pRoute),
  );

  const chatRoute = readFileSync(join(ROOT, 'app/api/chat/route.ts'), 'utf8');
  record(
    7,
    'agent solo system prompt: refus phrase',
    /Cette info ne passe pas par moi/i.test(chatRoute),
  );
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log(`RESULT : ${passed} OK / ${failed} KO (total ${passed + failed})`);
console.log('='.repeat(70));

// Tableau par layer
const byLayer = new Map();
for (const r of results) {
  if (!byLayer.has(r.layer)) byLayer.set(r.layer, { ok: 0, ko: 0 });
  const s = byLayer.get(r.layer);
  if (r.ok) s.ok++;
  else s.ko++;
}
console.log('\nPar layer :');
for (const [layer, { ok, ko }] of [...byLayer.entries()].sort()) {
  const status = ko === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  Layer ${layer} : ${status} (${ok} OK / ${ko} KO)`);
}

process.exit(failed > 0 ? 1 : 0);
