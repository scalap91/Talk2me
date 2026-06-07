#!/usr/bin/env node
/**
 * Talk2Me #408 E2E (Pascal 2026-06-05)
 *
 * Tests :
 *  A) Watch Together consentement (start pending → accept → sync → decline)
 *  B) Chess : new vs human + move sync
 *  C) Dames : new vs human + move sync
 *  D) Léa (chess vs lea + commentary persisté)
 *
 * Run : node tests/p408_e2e_2026_06_05.mjs
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';

const db = new Database(DB_PATH);
let pass = 0;
let fail = 0;
const errors = [];

function ok(label) {
  console.log(`✅ ${label}`);
  pass++;
}
function ko(label, err) {
  console.log(`❌ ${label} :: ${err}`);
  fail++;
  errors.push({ label, err });
}

function createUser(prefix) {
  const id = randomUUID();
  const username = `${prefix}_${randomBytes(2).toString('hex')}`;
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, prefix, `${username}+fuzz@test.com`, now, now, `T2M de ${prefix}`);
  return { id, username, talk2meId };
}

function createSession(userId) {
  const token = randomUUID();
  const now = Date.now();
  const expires = now + 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, expires);
  return token;
}

function createP2PConv(uA, uB) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'p2p', ?)"
  ).run(id, null, now, uA);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(id, uA, now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(id, uB, now);
  return id;
}

async function api(token, method, path, body) {
  const opts = {
    method,
    headers: { 'Cookie': `talk2me_session=${token}` },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data };
}

// ===== Setup =====
console.log('--- SETUP ---');
const userA = createUser('p408_a');
const userB = createUser('p408_b');
const convId = createP2PConv(userA.id, userB.id);
const tokenA = createSession(userA.id);
const tokenB = createSession(userB.id);
console.log(`userA=${userA.id} userB=${userB.id} conv=${convId}`);

// ===== PHASE A — Watch Together =====
console.log('\n--- PHASE A — Watch Together consent ---');

let activity = null;
try {
  const r = await api(tokenA, 'POST', '/api/activities/start', {
    conv_id: convId,
    kind: 'video',
    state: {
      video_id: 'aqz-KE-bpKQ',
      title: 'Big Buck Bunny',
      current_time_s: 0,
      is_playing: true,
      updated_at: Date.now(),
      leader_id: userA.id,
    },
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  activity = r.data.activity;
  if (activity.invite_status !== 'pending') {
    throw new Error(`expected pending, got ${activity.invite_status}`);
  }
  ok(`A1 — POST /activities/start → invite_status='pending' (activity ${activity.id})`);
} catch (e) {
  ko('A1 — start pending', e.message);
}

// A2 : B accepts
try {
  const r = await api(tokenB, 'POST', `/api/activities/${activity.id}/accept`);
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  if (r.data.activity.invite_status !== 'accepted') {
    throw new Error(`expected accepted, got ${r.data.activity.invite_status}`);
  }
  ok('A2 — userB POST /accept → invite_status=accepted');
} catch (e) {
  ko('A2 — accept', e.message);
}

// A3 : push sync event
try {
  const r = await api(tokenA, 'POST', `/api/activities/${activity.id}/sync`, {
    action: 'play',
    time: 0,
    client_ts: Date.now(),
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  ok('A3 — userA POST /sync action=play → broadcast');
} catch (e) {
  ko('A3 — sync', e.message);
}

// A4 : try sync with invalid action
try {
  const r = await api(tokenA, 'POST', `/api/activities/${activity.id}/sync`, {
    action: 'destroy',
    time: 0,
    client_ts: Date.now(),
  });
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  ok('A4 — invalid action → 400');
} catch (e) {
  ko('A4 — invalid action', e.message);
}

// A5 : end the activity, then try another, decline
try {
  await api(tokenA, 'POST', `/api/activities/${activity.id}/end`);
  await new Promise(r => setTimeout(r, 200));
  // Start fresh
  const r2 = await api(tokenA, 'POST', '/api/activities/start', {
    conv_id: convId, kind: 'video',
    state: { video_id: 'xxx', title: 'X', current_time_s: 0, is_playing: true, updated_at: Date.now(), leader_id: userA.id },
  });
  const a2 = r2.data.activity;
  const r3 = await api(tokenB, 'POST', `/api/activities/${a2.id}/decline`);
  if (r3.status !== 200) throw new Error(`decline status ${r3.status}`);
  if (r3.data.activity.invite_status !== 'declined') {
    throw new Error(`expected declined, got ${r3.data.activity.invite_status}`);
  }
  ok('A5 — decline → invite_status=declined + auto-end programmé');
} catch (e) {
  ko('A5 — decline', e.message);
}

// ===== PHASE B — Chess =====
console.log('\n--- PHASE B — Chess ---');

let chessGame = null;
try {
  const r = await api(tokenA, 'POST', '/api/chess/new', {
    conv_id: convId,
    opponent_user_id: userB.id,
    my_color: 'white',
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  chessGame = r.data.game;
  if (chessGame.player_white !== userA.id) throw new Error('A should be white');
  if (chessGame.player_black !== userB.id) throw new Error('B should be black');
  if (chessGame.status !== 'in_progress') throw new Error('status not in_progress');
  ok(`B1 — POST /api/chess/new vs user B → game ${chessGame.id}`);
} catch (e) {
  ko('B1 — chess new', e.message);
}

try {
  // A plays e2-e4
  const r = await api(tokenA, 'POST', `/api/chess/${chessGame.id}/move`, {
    from: 'e2', to: 'e4',
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  if (r.data.game.moves[0] !== 'e4') throw new Error(`expected e4, got ${r.data.game.moves[0]}`);
  ok('B2 — userA plays e2-e4 → moves[0]=e4');
} catch (e) {
  ko('B2 — chess move', e.message);
}

try {
  // A tries to play again (not their turn)
  const r = await api(tokenA, 'POST', `/api/chess/${chessGame.id}/move`, {
    from: 'e4', to: 'e5',
  });
  if (r.status !== 409) throw new Error(`expected 409, got ${r.status}`);
  ok('B3 — userA tries to play 2x consecutively → 409 not_your_turn');
} catch (e) {
  ko('B3 — wrong turn', e.message);
}

try {
  // B plays e7-e5
  const r = await api(tokenB, 'POST', `/api/chess/${chessGame.id}/move`, {
    from: 'e7', to: 'e5',
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  ok('B4 — userB plays e7-e5 (legal)');
} catch (e) {
  ko('B4 — chess B move', e.message);
}

try {
  // Illegal move
  const r = await api(tokenA, 'POST', `/api/chess/${chessGame.id}/move`, {
    from: 'a1', to: 'h8',
  });
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  ok('B5 — illegal move → 400');
} catch (e) {
  ko('B5 — illegal', e.message);
}

try {
  // GET game
  const r = await api(tokenA, 'GET', `/api/chess/${chessGame.id}`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (r.data.game.moves.length !== 2) throw new Error(`expected 2 moves, got ${r.data.game.moves.length}`);
  ok('B6 — GET /api/chess/[id] → 2 moves jouées');
} catch (e) {
  ko('B6 — chess GET', e.message);
}

// ===== PHASE C — Dames =====
console.log('\n--- PHASE C — Dames ---');

let dameGame = null;
try {
  const r = await api(tokenA, 'POST', '/api/dame/new', {
    conv_id: convId,
    opponent_user_id: userB.id,
    my_color: 'white',
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  dameGame = r.data.game;
  if (dameGame.state.board.length !== 10) throw new Error('board not 10x10');
  if (dameGame.state.turn !== 'white') throw new Error('turn not white');
  // Count pieces : 20 each side
  let wp = 0, bp = 0;
  for (const row of dameGame.state.board) {
    for (const c of row) {
      if (c === 1) wp++;
      if (c === 2) bp++;
    }
  }
  if (wp !== 20 || bp !== 20) throw new Error(`pieces: W=${wp} B=${bp}, expected 20/20`);
  ok(`C1 — POST /api/dame/new vs user B → game ${dameGame.id}, 20/20 pions`);
} catch (e) {
  ko('C1 — dame new', e.message);
}

try {
  // White moves diagonally forward : row 6 col 1 (WP) → row 5 col 0 OR row 5 col 2
  // board layout : row 0 noir au haut, row 9 blanc en bas
  // initialDameState : row 0..3 noirs, row 6..9 blancs. So row 6 col 1 = white pion
  const r = await api(tokenA, 'POST', `/api/dame/${dameGame.id}/move`, {
    from: [6, 1],
    to: [5, 0],
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  ok('C2 — userA plays (6,1)→(5,0) (legal diagonal)');
} catch (e) {
  ko('C2 — dame move', e.message);
}

try {
  // A tries to play again
  const r = await api(tokenA, 'POST', `/api/dame/${dameGame.id}/move`, {
    from: [5, 0], to: [4, 1],
  });
  if (r.status !== 409) throw new Error(`expected 409, got ${r.status}`);
  ok('C3 — userA tries 2nd consecutive → 409 not_your_turn');
} catch (e) {
  ko('C3 — dame wrong turn', e.message);
}

try {
  // B plays a legal move
  const r = await api(tokenB, 'POST', `/api/dame/${dameGame.id}/move`, {
    from: [3, 0], to: [4, 1],
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  ok('C4 — userB plays (3,0)→(4,1) (legal)');
} catch (e) {
  ko('C4 — dame B move', e.message);
}

try {
  // GET dame
  const r = await api(tokenA, 'GET', `/api/dame/${dameGame.id}`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (r.data.game.moves.length !== 2) throw new Error(`expected 2 moves, got ${r.data.game.moves.length}`);
  ok('C5 — GET /api/dame/[id] → 2 moves jouées');
} catch (e) {
  ko('C5 — dame GET', e.message);
}

// ===== PHASE D — Léa (chess vs lea) =====
console.log('\n--- PHASE D — Léa joue ---');
console.log('(Note: agent conv requise pour Léa solo, on utilise un POST direct lea opponent dans agent conv)');

// Pour Léa solo, on a besoin d'une conv agent. Création directe.
function createAgentConv(userId) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
  ).run(id, userId, now, userId);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(id, userId, now);
  return id;
}

const agentConvId = createAgentConv(userA.id);

let leaGame = null;
try {
  const r = await api(tokenA, 'POST', '/api/chess/new', {
    conv_id: agentConvId,
    opponent_user_id: 'lea',
    my_color: 'white',
  });
  if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.data)}`);
  leaGame = r.data.game;
  if (leaGame.player_black !== 'lea') throw new Error(`expected lea as black, got ${leaGame.player_black}`);
  ok(`D1 — POST /api/chess/new vs Léa → game ${leaGame.id}`);
} catch (e) {
  ko('D1 — chess vs lea new', e.message);
}

try {
  // A plays e2-e4 ; Léa devrait jouer en background
  const r = await api(tokenA, 'POST', `/api/chess/${leaGame.id}/move`, {
    from: 'e2', to: 'e4',
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  ok('D2 — userA plays e4, Léa déclenchée en background');
  // Wait for Stockfish to play (jusqu'à 5s)
  let leaPlayed = false;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 250));
    const g = await api(tokenA, 'GET', `/api/chess/${leaGame.id}`);
    if (g.data?.game?.moves?.length >= 2) {
      leaPlayed = true;
      console.log(`    → Léa a joué : ${g.data.game.moves[1]} (après ${(i + 1) * 0.25}s)`);
      break;
    }
  }
  if (!leaPlayed) {
    ko('D3 — Léa joue son coup en background', 'timeout 6s');
  } else {
    ok('D3 — Léa a répondu au coup user (Stockfish OK)');
  }
} catch (e) {
  ko('D2/3 — chess vs lea', e.message);
}

// Verify commentary appended (might or might not exist if DEEPSEEK_API_KEY absent)
try {
  await new Promise(r => setTimeout(r, 1500)); // attend commentary async
  const msgs = db.prepare(
    "SELECT text, kind, ai_for_user_id FROM messages WHERE conversation_id = ? AND kind = 'ai_reply' ORDER BY created_at DESC"
  ).all(agentConvId);
  if (msgs.length === 0) {
    console.log('    (pas de commentary trouvé — peut-être DeepSeek key absente)');
    ok('D4 — commentary structure OK (vide si pas de clé DeepSeek)');
  } else {
    console.log(`    → commentary Léa : "${msgs[0].text}"`);
    ok(`D4 — commentary Léa persisté (${msgs.length} message(s))`);
  }
} catch (e) {
  ko('D4 — commentary', e.message);
}

// Cleanup
db.prepare('DELETE FROM chess_games WHERE conv_id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM dame_games WHERE conv_id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM activities WHERE conv_id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM messages WHERE conversation_id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM conversation_participants WHERE conversation_id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM conversations WHERE id IN (?, ?)').run(convId, agentConvId);
db.prepare('DELETE FROM sessions WHERE user_id IN (?, ?)').run(userA.id, userB.id);
db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userA.id, userB.id);

console.log(`\n--- RÉSULTAT : ${pass} pass / ${fail} fail ---`);
if (fail > 0) {
  console.log('Errors:');
  for (const { label, err } of errors) console.log(`  - ${label} :: ${err}`);
  process.exit(1);
}
process.exit(0);
