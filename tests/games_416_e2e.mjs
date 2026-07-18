#!/usr/bin/env node
/**
 * Talk2Me #416 — E2E test pour Pause/Resume + Mode arbitre + find-or-create.
 * Pascal 2026-06-05.
 *
 * Couvre les 5 scénarios obligatoires du brief :
 *   1. Solo Pascal vs Léa : create + move Pascal + auto-réponse Léa
 *   2. Pause + reprise
 *   3. Mode arbitre P2P : 2 humains, Léa N'INTERVIENT PAS
 *   4. Détection partie existante (find-or-create idempotent)
 *   5. force_new : ancienne abandonnée + nouvelle créée
 *
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] : écrit un rapport .md.
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_PATH = process.cwd() + '/data/talktome.db';
const API_BASE = 'http://localhost:3010';
const REPORT_DIR = process.cwd() + '/reports';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const now = Date.now();
const results = [];
const passed = [];
const failed = [];

function record(name, ok, info) {
  results.push({ name, ok, info });
  if (ok) {
    passed.push(name);
    console.log(`  ✓ ${name}${info ? ' — ' + info : ''}`);
  } else {
    failed.push({ name, info });
    console.log(`  ✗ ${name}${info ? ' — ' + info : ''}`);
  }
}

// ---------- Setup : crée 2 users + 2 sessions + 1 conv P2P ----------
function createUser(label) {
  const id = crypto.randomUUID();
  const talk2meId = String(100000 + Math.floor(Math.random() * 900000));
  const username = `t2m416_${label}_${Date.now().toString(36).slice(-6)}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email,
                         created_at, last_seen, ai_name, ai_gender, avatar_url)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'Léa', 'feminin', NULL)`
  ).run(id, talk2meId, username, `Test ${label}`, `${username}@test.com`, now, now);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, id, now, now + 86_400_000);
  return { id, username, token };
}

const userPascal = createUser('pascal');
const userKarim = createUser('karim');
console.log(`[setup] pascal=${userPascal.username}  karim=${userKarim.username}`);

// Friendship + conv P2P
const [a, b] = [userPascal.id, userKarim.id].sort();
db.prepare(
  `INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at)
     VALUES (?, ?, ?, 'accepted', ?)`
).run(crypto.randomUUID(), a, b, now);

const convP2P = crypto.randomUUID();
db.prepare(
  `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'p2p', ?)`
).run(convP2P, userPascal.id, now, userPascal.id);
db.prepare(
  'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
).run(convP2P, userPascal.id, now);
db.prepare(
  'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
).run(convP2P, userKarim.id, now);
console.log(`[setup] convP2P=${convP2P}`);

// Conv agent (solo Léa) pour Pascal
const convAgentPascal = crypto.randomUUID();
db.prepare(
  `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'agent', ?)`
).run(convAgentPascal, userPascal.id, now, userPascal.id);
db.prepare(
  'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
).run(convAgentPascal, userPascal.id, now);

db.close();

const cookiePascal = `talk2me_session=${userPascal.token}`;
const cookieKarim = `talk2me_session=${userKarim.token}`;

async function api(method, path, cookie, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =========== Scénario 1 : Solo Pascal vs Léa ===========
console.log('\n[1] Solo Pascal vs Léa (chess) — create + move + autoreply Léa');
let scenario1ok = false;
{
  const r = await api('POST', '/api/chess/find-or-create', cookiePascal, {
    conv_id: convAgentPascal,
    opponent: 'lea',
    mode: 'solo',
    my_color: 'white', // assure Pascal joue en premier
  });
  record('1a create solo', r.ok && !!r.json.game?.id && r.json.existing === false,
    `status=${r.status} existing=${r.json.existing} game=${r.json.game?.id?.slice(0, 8)}`);
  const gameId = r.json.game?.id;
  if (gameId) {
    // Verify arbiter null + player_black = lea
    const c = await api('GET', `/api/chess/${gameId}`, cookiePascal);
    record('1b arbiter null + opponent=lea', c.json.game?.arbiter === null && c.json.game?.player_black === 'lea',
      `arbiter=${c.json.game?.arbiter} pb=${c.json.game?.player_black}`);

    // Pascal joue e2-e4
    const moveRes = await api('POST', `/api/chess/${gameId}/move`, cookiePascal, {
      from: 'e2', to: 'e4',
    });
    record('1c move e2-e4', moveRes.ok, `status=${moveRes.status} err=${moveRes.json.error || ''}`);

    // Attente que Léa joue
    await sleep(4000);
    const after = await api('GET', `/api/chess/${gameId}`, cookiePascal);
    const movesAfter = after.json.game?.moves?.length || 0;
    record('1d Léa a répondu', movesAfter >= 2,
      `moves.length=${movesAfter}`);
    scenario1ok = moveRes.ok && movesAfter >= 2;
  }
}

// =========== Scénario 2 : Pause + Resume ===========
console.log('\n[2] Pause + Resume (dame) — solo Pascal');
let pauseGameId = null;
{
  const r = await api('POST', '/api/dame/find-or-create', cookiePascal, {
    conv_id: convAgentPascal,
    opponent: 'lea',
    mode: 'solo',
    my_color: 'white',
  });
  pauseGameId = r.json.game?.id;
  record('2a create solo dame', !!pauseGameId, `game=${pauseGameId?.slice(0, 8)}`);

  if (pauseGameId) {
    const pauseR = await api('POST', `/api/dame/${pauseGameId}/pause`, cookiePascal);
    record('2b pause', pauseR.ok && !!pauseR.json.game?.paused_at,
      `paused_at=${pauseR.json.game?.paused_at}`);

    // Tentative move pendant pause → doit échouer
    const moveBlocked = await api('POST', `/api/dame/${pauseGameId}/move`, cookiePascal, {
      from: [6, 1], to: [5, 0],
    });
    record('2c move pendant pause REFUSÉ', moveBlocked.status === 409 && moveBlocked.json.error === 'game_paused',
      `status=${moveBlocked.status} err=${moveBlocked.json.error}`);

    const resumeR = await api('POST', `/api/dame/${pauseGameId}/resume`, cookiePascal);
    record('2d resume', resumeR.ok && resumeR.json.game?.paused_at === null,
      `paused_at=${resumeR.json.game?.paused_at}`);

    // Pause idempotent ?
    await api('POST', `/api/dame/${pauseGameId}/pause`, cookiePascal);
    const pauseAgain = await api('POST', `/api/dame/${pauseGameId}/pause`, cookiePascal);
    record('2e pause idempotent', pauseAgain.ok, `status=${pauseAgain.status}`);

    await api('POST', `/api/dame/${pauseGameId}/resume`, cookiePascal);
  }
}

// =========== Scénario 3 : Mode arbitre P2P ===========
console.log('\n[3] Mode arbitre P2P — Pascal vs Karim, Léa observe');
let arbiterGameId = null;
{
  const r = await api('POST', '/api/chess/find-or-create', cookiePascal, {
    conv_id: convP2P,
    opponent: userKarim.id,
    mode: 'arbiter',
    my_color: 'white',
  });
  arbiterGameId = r.json.game?.id;
  record('3a create arbitre', !!arbiterGameId && r.json.game?.arbiter === 'lea',
    `arbiter=${r.json.game?.arbiter} pb=${r.json.game?.player_black}`);

  if (arbiterGameId) {
    record('3b player_black = karim (PAS lea)', r.json.game?.player_black === userKarim.id,
      `player_black=${r.json.game?.player_black}`);

    // Pascal joue
    const m1 = await api('POST', `/api/chess/${arbiterGameId}/move`, cookiePascal, {
      from: 'e2', to: 'e4',
    });
    record('3c Pascal joue e2-e4', m1.ok, `status=${m1.status} err=${m1.json.error || ''}`);

    // Attendre, vérifier que Léa N'A PAS joué
    await sleep(3500);
    const after = await api('GET', `/api/chess/${arbiterGameId}`, cookiePascal);
    const movesAfter = after.json.game?.moves?.length || 0;
    record('3d Léa N\'A PAS joué (1 seul move)', movesAfter === 1,
      `moves.length=${movesAfter}`);

    // Karim joue
    const m2 = await api('POST', `/api/chess/${arbiterGameId}/move`, cookieKarim, {
      from: 'e7', to: 'e5',
    });
    record('3e Karim joue e7-e5', m2.ok, `status=${m2.status} err=${m2.json.error || ''}`);

    await sleep(3500);
    const after2 = await api('GET', `/api/chess/${arbiterGameId}`, cookiePascal);
    record('3f Léa toujours observatrice (2 moves humains)', after2.json.game?.moves?.length === 2,
      `moves.length=${after2.json.game?.moves?.length}`);
  }
}

// =========== Scénario 4 : Détection partie existante ===========
console.log('\n[4] Détection partie existante (idempotent)');
{
  const r = await api('POST', '/api/chess/find-or-create', cookiePascal, {
    conv_id: convP2P,
    opponent: userKarim.id,
    mode: 'arbiter',
  });
  record('4a existing=true sur re-appel', r.json.existing === true && r.json.game?.id === arbiterGameId,
    `existing=${r.json.existing} id=${r.json.game?.id?.slice(0, 8)} (orig=${arbiterGameId?.slice(0, 8)})`);
}

// =========== Scénario 5 : force_new ===========
console.log('\n[5] force_new : ancienne abandonnée + nouvelle créée');
{
  const r = await api('POST', '/api/chess/find-or-create', cookiePascal, {
    conv_id: convP2P,
    opponent: userKarim.id,
    mode: 'arbiter',
    force_new: true,
  });
  const newId = r.json.game?.id;
  record('5a nouvelle game créée', !!newId && r.json.existing === false && newId !== arbiterGameId,
    `new=${newId?.slice(0, 8)} existing=${r.json.existing}`);

  // Verify l'ancienne est abandonnée (status='draw' winner=null)
  const oldCheck = await api('GET', `/api/chess/${arbiterGameId}`, cookiePascal);
  record('5b ancienne game = status non-in_progress', oldCheck.json.game?.status !== 'in_progress',
    `status=${oldCheck.json.game?.status} winner=${oldCheck.json.game?.winner}`);

  // Et nouvelle = in_progress + arbiter='lea'
  const newCheck = await api('GET', `/api/chess/${newId}`, cookiePascal);
  record('5c nouvelle = in_progress + arbiter=lea',
    newCheck.json.game?.status === 'in_progress' && newCheck.json.game?.arbiter === 'lea',
    `status=${newCheck.json.game?.status} arb=${newCheck.json.game?.arbiter}`);
}

// =========== Scénario 6 : helper triggerGameFromConv via /api/games/trigger ===========
console.log('\n[6] Helper /api/games/trigger (bridge UI ↔ lea-trigger)');
{
  const r = await api('POST', '/api/games/trigger', cookiePascal, {
    conv_id: convAgentPascal,
    game_kind: 'chess',
    intent: 'auto',
    conv_peer_id: null,
  });
  record('6a trigger solo auto OK', r.ok && !!r.json.game_id && r.json.mode === 'solo',
    `ok=${r.ok} game=${r.json.game_id?.slice(0, 8)} mode=${r.json.mode} existing=${r.json.existing}`);

  // Trigger dans conv P2P → mode arbiter
  const r2 = await api('POST', '/api/games/trigger', cookiePascal, {
    conv_id: convP2P,
    game_kind: 'dame',
    intent: 'auto',
    conv_peer_id: userKarim.id,
  });
  record('6b trigger arbitre auto OK', r2.ok && !!r2.json.game_id && r2.json.mode === 'arbiter',
    `mode=${r2.json.mode} existing=${r2.json.existing}`);

  // Trigger intent='new' → doit créer une autre game
  const r3 = await api('POST', '/api/games/trigger', cookiePascal, {
    conv_id: convP2P,
    game_kind: 'dame',
    intent: 'new',
    conv_peer_id: userKarim.id,
  });
  record('6c trigger intent=new force nouvelle', r3.ok && r3.json.existing === false && r3.json.game_id !== r2.json.game_id,
    `new=${r3.json.game_id?.slice(0, 8)} (orig=${r2.json.game_id?.slice(0, 8)})`);

  // Trigger intent='resume' sur la nouvelle → existing=true
  const r4 = await api('POST', '/api/games/trigger', cookiePascal, {
    conv_id: convP2P,
    game_kind: 'dame',
    intent: 'resume',
    conv_peer_id: userKarim.id,
  });
  record('6d trigger intent=resume retrouve la game', r4.ok && r4.json.existing === true && r4.json.game_id === r3.json.game_id,
    `existing=${r4.json.existing} id=${r4.json.game_id?.slice(0, 8)}`);
}

// =========== Rapport ===========
const total = results.length;
console.log(`\n=========== RÉSUMÉ ===========`);
console.log(`Total: ${total}  ✓Pass: ${passed.length}  ✗Fail: ${failed.length}`);

try {
  mkdirSync(REPORT_DIR, { recursive: true });
} catch { /* exists */ }
const reportPath = resolve(REPORT_DIR, `games_416_e2e_${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
const md = [
  `# Talk2Me #416 — E2E Test Report (Pause/Resume + Arbitre Léa)`,
  ``,
  `**Date** : ${new Date().toISOString()}`,
  `**Total** : ${total} (${passed.length} ✓ / ${failed.length} ✗)`,
  ``,
  `## Résultats`,
  '',
  ...results.map((r) => `- ${r.ok ? '✓' : '✗'} **${r.name}** — ${r.info || ''}`),
  ``,
  `## Effets de bord (sandbox)`,
  ``,
  `- Users créés : pascal=${userPascal.username}, karim=${userKarim.username}`,
  `- Conv P2P : ${convP2P}`,
  `- Conv agent (Pascal) : ${convAgentPascal}`,
  `- Games créées : ~6-8 chess + dame (toutes en DB ; nettoyage manuel si souhaité via DELETE FROM chess_games / dame_games WHERE conv_id IN (?, ?))`,
  ``,
  failed.length > 0 ? `## Échecs détaillés\n\n${failed.map((f) => `- **${f.name}** : ${f.info || ''}`).join('\n')}` : '',
].join('\n');
writeFileSync(reportPath, md);
console.log(`\n[report] ${reportPath}`);

process.exit(failed.length === 0 ? 0 : 1);
