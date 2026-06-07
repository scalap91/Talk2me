#!/usr/bin/env node
/**
 * test-sfu-mediasoup-403.mjs — Talk2Me #403 E2E SFU smoke test.
 *
 * Vérifie que le pipeline mediasoup serveur répond correctement de bout
 * en bout SANS dépendre d'un browser réel (qui exigerait un vrai mic/cam
 * physique pour produce). Test :
 *   1. Crée 2 sessions cookies pour 2 users d'une conv P2P existante
 *   2. POST /api/activities/start → crée activity kind='video'
 *   3. POST /api/sfu/join (user A) → vérifie routerRtpCapabilities + peerId
 *   4. POST /api/sfu/transport/create direction=send (user A) → vérifie
 *      iceCandidates pointe sur MEDIASOUP_ANNOUNCED_IP
 *   5. POST /api/sfu/join (user B) → vérifie pas crash, peerId B
 *   6. POST /api/sfu/leave (A + B)
 *   7. POST /api/activities/{id}/end → cleanup
 *
 * Usage :
 *   node scripts/test-sfu-mediasoup-403.mjs
 */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const BASE = process.env.T2M_BASE || 'http://localhost:3010';
const DB_PATH = 'data/talktome.db';

const db = new Database(DB_PATH);

// 1. Trouve une conv P2P avec exactement 2 users
const row = db
  .prepare(
    `SELECT c.id AS conv_id, GROUP_CONCAT(p.user_id) AS users
     FROM conversations c
     JOIN conversation_participants p ON p.conversation_id = c.id
     WHERE c.kind = 'p2p'
     GROUP BY c.id
     HAVING COUNT(p.user_id) = 2
     LIMIT 1`
  )
  .get();
if (!row) {
  console.error('Aucune conv P2P 2-users en DB. Crée-en une via UI.');
  process.exit(1);
}
const [userA, userB] = row.users.split(',');
const convId = row.conv_id;
console.log(`[test] conv P2P ${convId} users=${userA.slice(0,8)} + ${userB.slice(0,8)}`);

// 2. Crée 2 sessions cookies
function mkSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, now + 60 * 60 * 1000);
  return token;
}
const tokenA = mkSession(userA);
const tokenB = mkSession(userB);
console.log(`[test] sessions créées A=${tokenA.slice(0,10)}… B=${tokenB.slice(0,10)}…`);

async function api(path, opts = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (token) headers.Cookie = `talk2me_session=${token}`;
  const res = await fetch(BASE + path, {
    ...opts,
    headers,
    redirect: 'manual',
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body };
}

let failed = 0;
function expect(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label} ${detail}`);
    failed++;
  }
}

// 3. Crée activity
console.log('[test] 3. POST /api/activities/start');
const startRes = await api(
  '/api/activities/start',
  {
    method: 'POST',
    body: JSON.stringify({
      conv_id: convId,
      kind: 'video',
      state: {
        video_id: 'dQw4w9WgXcQ',
        title: 'SFU test',
        current_time_s: 0,
        is_playing: false,
        updated_at: Date.now(),
        leader_id: userA,
      },
    }),
  },
  tokenA
);
expect(`activities/start status=200`, startRes.status === 200, JSON.stringify(startRes.body));
const activityId = startRes.body?.activity?.id;
expect(`activity_id reçu`, !!activityId);
if (!activityId) {
  console.error('abort, no activity_id');
  process.exit(1);
}
console.log(`  activity_id=${activityId}`);

// 4. Join SFU (A)
console.log('[test] 4. POST /api/sfu/join (A)');
const joinA = await api(
  '/api/sfu/join',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId }) },
  tokenA
);
expect(`sfu/join A status=200`, joinA.status === 200, JSON.stringify(joinA.body));
expect(`routerRtpCapabilities présent`, !!joinA.body?.routerRtpCapabilities);
expect(`codec opus présent`, JSON.stringify(joinA.body?.routerRtpCapabilities || {}).includes('audio/opus'));
expect(`codec VP8 présent`, JSON.stringify(joinA.body?.routerRtpCapabilities || {}).includes('video/VP8'));
expect(`peerId = userA`, joinA.body?.peerId === userA);

// 5. Transport create (A)
console.log('[test] 5. POST /api/sfu/transport/create (A, send)');
const txA = await api(
  '/api/sfu/transport/create',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId, direction: 'send' }) },
  tokenA
);
expect(`transport/create A status=200`, txA.status === 200, JSON.stringify(txA.body));
const candidates = txA.body?.transport?.iceCandidates || [];
expect(`iceCandidates non vide`, candidates.length > 0);
const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || '141.95.7.170';
expect(
  `iceCandidates contient l'IP announcée ${announcedIp}`,
  candidates.some((c) => c.ip === announcedIp),
  `got: ${JSON.stringify(candidates.map(c => c.ip))}`
);
expect(`iceCandidates port dans 40000-49999`,
  candidates.every(c => c.port >= 40000 && c.port <= 49999),
  `ports: ${candidates.map(c => c.port).join(',')}`);

// 6. Join SFU (B)
console.log('[test] 6. POST /api/sfu/join (B)');
const joinB = await api(
  '/api/sfu/join',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId }) },
  tokenB
);
expect(`sfu/join B status=200`, joinB.status === 200, JSON.stringify(joinB.body));
expect(`peerId = userB`, joinB.body?.peerId === userB);
// A doit voir 0 producer de B au join (B vient d'arriver, pas encore produce)
expect(`existingProducers reflète état (peut être vide)`, Array.isArray(joinB.body?.existingProducers));

// 7. Transport create (B, recv)
console.log('[test] 7. POST /api/sfu/transport/create (B, recv)');
const txB = await api(
  '/api/sfu/transport/create',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId, direction: 'recv' }) },
  tokenB
);
expect(`transport/create B status=200`, txB.status === 200, JSON.stringify(txB.body));

// 8. Test auth : user C non participant ne peut pas join
console.log('[test] 8. Test sécurité : user non-participant');
const userC = db.prepare(
  `SELECT id FROM users WHERE id != ? AND id != ? LIMIT 1`
).get(userA, userB)?.id;
if (userC) {
  const tokenC = mkSession(userC);
  const joinC = await api(
    '/api/sfu/join',
    { method: 'POST', body: JSON.stringify({ activity_id: activityId }) },
    tokenC
  );
  expect(`sfu/join user non-participant retourne 403`, joinC.status === 403, JSON.stringify(joinC.body));
}

// 9. Leave both
console.log('[test] 9. POST /api/sfu/leave (A + B)');
const leaveA = await api(
  '/api/sfu/leave',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId }) },
  tokenA
);
expect(`sfu/leave A status=200`, leaveA.status === 200);
const leaveB = await api(
  '/api/sfu/leave',
  { method: 'POST', body: JSON.stringify({ activity_id: activityId }) },
  tokenB
);
expect(`sfu/leave B status=200`, leaveB.status === 200);

// 10. End activity (cleanup serveur)
console.log('[test] 10. POST /api/activities/{id}/end');
const endRes = await api(
  `/api/activities/${activityId}/end`,
  { method: 'POST' },
  tokenA
);
expect(`activities/end status=200`, endRes.status === 200);

console.log(`\n=== RÉSULTAT ===`);
if (failed === 0) {
  console.log(`✅ Tous les checks passent.`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} check(s) failed.`);
  process.exit(1);
}
