// Talk2Me Calls v2 — E2E test (Talk2Me #418)
// Crée 2 users, les rend amis, simule le flow complet ringing → accept → hangup.
//
// Usage : node /tmp/calls_v2_e2e.mjs

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const BASE = 'http://localhost:3010';
const DB_PATH = process.cwd() + '/data/talktome.db';

const db = new Database(DB_PATH);

function ensureUser(username, displayName) {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existing) return existing;
  const id = randomUUID();
  const talk2meId = String(Math.floor(100000 + Math.random() * 900000));
  const now = Date.now();
  db.prepare(`INSERT INTO users (id, talk2me_id, username, display_name, password_hash, created_at, last_seen)
              VALUES (?, ?, ?, ?, NULL, ?, ?)`).run(id, talk2meId, username, displayName, now, now);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function ensureFriendship(userA, userB) {
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  const existing = db.prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(a, b);
  if (existing) {
    if (existing.status !== 'accepted') {
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
    }
    return;
  }
  db.prepare(`INSERT INTO friendships (id, user_a, user_b, status, created_at)
              VALUES (?, ?, ?, 'accepted', ?)`).run(randomUUID(), a, b, Date.now());
}

function createSession(userId) {
  const token = randomUUID() + randomUUID();
  const now = Date.now();
  const expires = now + 30 * 24 * 3600 * 1000;
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at)
              VALUES (?, ?, ?, ?)`).run(token, userId, now, expires);
  return token;
}

function purgeActiveCallsFor(userId) {
  db.prepare("UPDATE calls SET state = 'ended', ended_at = ?, end_reason = 'network_error' WHERE (caller_id = ? OR callee_id = ?) AND state IN ('ringing','accepted')").run(Date.now(), userId, userId);
}

async function curl(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function ok(cond, label) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

async function sse(path, token, expectedEvent, timeoutMs = 5000) {
  // Connecte via fetch streaming et collecte les events nommés.
  return new Promise((resolve) => {
    const events = [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      resolve(events);
    }, timeoutMs);
    fetch(`${BASE}${path}`, {
      headers: {
        Cookie: `talk2me_session=${token}`,
        Accept: 'text/event-stream',
      },
      signal: ctrl.signal,
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let currentEvt = null;
      while (true) {
        const { done, value } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trimEnd();
          buf = buf.slice(idx + 1);
          if (line.startsWith('event:')) {
            currentEvt = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            try {
              events.push({ event: currentEvt, data: JSON.parse(data) });
            } catch {
              events.push({ event: currentEvt, data });
            }
            currentEvt = null;
          } else if (line === '') {
            currentEvt = null;
          }
          if (expectedEvent && events.some(e => e.event === expectedEvent)) {
            clearTimeout(timer);
            ctrl.abort();
            return resolve(events);
          }
        }
      }
      clearTimeout(timer);
      resolve(events);
    }).catch(() => {
      clearTimeout(timer);
      resolve(events);
    });
  });
}

(async () => {
  console.log('# Setup');
  const pascal = ensureUser('e2e_pascal_call', 'Pascal E2E');
  const karim = ensureUser('e2e_karim_call', 'Karim E2E');
  const otherUser = ensureUser('e2e_other_call', 'Other E2E');
  ensureFriendship(pascal.id, karim.id);
  // Other PAS ami → utile pour test anti-spoof not_friends
  console.log(`Pascal: ${pascal.id}`);
  console.log(`Karim:  ${karim.id}`);
  console.log(`Other:  ${otherUser.id}`);

  purgeActiveCallsFor(pascal.id);
  purgeActiveCallsFor(karim.id);
  purgeActiveCallsFor(otherUser.id);

  const tPascal = createSession(pascal.id);
  const tKarim = createSession(karim.id);
  const tOther = createSession(otherUser.id);

  console.log('\n# Test 1 — Flow complet ringing → ring_beats → accept → hangup');
  // 1. Démarre l'écoute SSE de Pascal en arrière-plan.
  const pascalEvents = [];
  const pascalCtrl = new AbortController();
  const pascalSse = fetch(`${BASE}/api/me/events`, {
    headers: { Cookie: `talk2me_session=${tPascal}`, Accept: 'text/event-stream' },
    signal: pascalCtrl.signal,
  }).then(async (res) => {
    if (!res.ok) {
      console.log(`Pascal SSE status ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let currentEvt = null;
    while (true) {
      const { done, value } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trimEnd();
        buf = buf.slice(idx + 1);
        if (line.startsWith('event:')) currentEvt = line.slice(6).trim();
        else if (line.startsWith('data:')) {
          try {
            pascalEvents.push({ event: currentEvt, data: JSON.parse(line.slice(5).trim()) });
          } catch { /* ignore */ }
          currentEvt = null;
        } else if (line === '') currentEvt = null;
      }
    }
  }).catch(() => {});

  // Petite attente pour que SSE soit subscribed
  await new Promise(r => setTimeout(r, 300));

  // 2. Pascal initie l'appel
  const newRes = await curl('POST', '/api/calls/new', tPascal, {
    callee_id: karim.id, kind: 'audio',
  });
  ok(newRes.status === 200 && newRes.data?.ok, `POST /api/calls/new → ${newRes.status}`);
  const callId = newRes.data?.call_id;
  ok(typeof callId === 'string', `call_id retourné : ${callId}`);

  // 3. Karim envoie 3 ring_beats à 1.2s d'intervalle
  let beatsOk = 0;
  for (let i = 0; i < 3; i++) {
    const r = await curl('POST', `/api/calls/${callId}/ring_beat`, tKarim);
    if (r.status === 200) beatsOk++;
    else console.log(`  ring_beat ${i+1} → ${r.status} ${JSON.stringify(r.data)}`);
    await new Promise(r => setTimeout(r, 1200));
  }
  ok(beatsOk === 3, `3 ring_beats acceptés (${beatsOk}/3)`);

  // Attends le relai SSE
  await new Promise(r => setTimeout(r, 400));
  const beatEvents = pascalEvents.filter(e => e.event === 'call:ring_beat' && e.data?.call_id === callId);
  ok(beatEvents.length >= 3, `Pascal a reçu >=3 events call:ring_beat (${beatEvents.length})`);

  // 4. Karim accepte
  const accRes = await curl('POST', `/api/calls/${callId}/accept`, tKarim);
  ok(accRes.status === 200 && accRes.data?.ok, `POST accept → ${accRes.status}`);

  await new Promise(r => setTimeout(r, 300));
  const accEvent = pascalEvents.find(e => e.event === 'call:accepted' && e.data?.call_id === callId);
  ok(!!accEvent, `Pascal a reçu call:accepted`);

  // 5. Pascal hangup
  const hupRes = await curl('POST', `/api/calls/${callId}/hangup`, tPascal, { reason: 'caller_hangup' });
  ok(hupRes.status === 200, `POST hangup → ${hupRes.status}`);

  await new Promise(r => setTimeout(r, 300));
  const hupEvent = pascalEvents.find(e => e.event === 'call:hangup' && e.data?.call_id === callId);
  ok(!!hupEvent, `Pascal a reçu call:hangup`);

  // 6. État final en DB
  const finalState = db.prepare('SELECT state, end_reason FROM calls WHERE id = ?').get(callId);
  ok(finalState?.state === 'ended', `state final = 'ended' (got ${finalState?.state})`);
  ok(finalState?.end_reason === 'caller_hangup', `end_reason = 'caller_hangup' (got ${finalState?.end_reason})`);

  pascalCtrl.abort();
  await pascalSse;

  console.log('\n# Test 2 — Decline → busy');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);

  const pEvts2 = [];
  const pCtrl2 = new AbortController();
  const pSse2 = fetch(`${BASE}/api/me/events`, {
    headers: { Cookie: `talk2me_session=${tPascal}`, Accept: 'text/event-stream' },
    signal: pCtrl2.signal,
  }).then(async (res) => {
    if (!res.ok) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let currentEvt = null;
    while (true) {
      const { done, value } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trimEnd();
        buf = buf.slice(idx + 1);
        if (line.startsWith('event:')) currentEvt = line.slice(6).trim();
        else if (line.startsWith('data:')) {
          try { pEvts2.push({ event: currentEvt, data: JSON.parse(line.slice(5).trim()) }); } catch {}
          currentEvt = null;
        } else if (line === '') currentEvt = null;
      }
    }
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 300));

  const new2 = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  ok(new2.status === 200, `Nouveau call → ${new2.status}`);
  const cid2 = new2.data?.call_id;
  const dec = await curl('POST', `/api/calls/${cid2}/decline`, tKarim);
  ok(dec.status === 200, `decline → ${dec.status}`);
  await new Promise(r => setTimeout(r, 300));
  const busyE = pEvts2.find(e => e.event === 'call:busy' && e.data?.call_id === cid2);
  ok(!!busyE, `Pascal a reçu call:busy`);
  const dbState2 = db.prepare('SELECT state, end_reason FROM calls WHERE id = ?').get(cid2);
  ok(dbState2?.state === 'declined' && dbState2?.end_reason === 'declined', `state=declined`);
  pCtrl2.abort(); await pSse2;

  console.log('\n# Test 3 — Anti-spoof : ring_beat depuis un user non-callee');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id); purgeActiveCallsFor(otherUser.id);
  // Pour ce test, on doit appeler quelqu'un AVEC qui pascal est ami pour
  // que /new accepte. Pascal appelle Karim ; on tente le ring_beat depuis
  // Other (qui n'est ni caller ni callee).
  const new3 = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  ok(new3.status === 200, `new pour anti-spoof → ${new3.status}`);
  const cid3 = new3.data?.call_id;
  const spoof = await curl('POST', `/api/calls/${cid3}/ring_beat`, tOther);
  ok(spoof.status === 403, `ring_beat tiers → 403 (got ${spoof.status})`);
  // Cleanup
  await curl('POST', `/api/calls/${cid3}/hangup`, tPascal, { reason: 'caller_hangup' });

  console.log('\n# Test 4 — Anti-spoof : accept/decline depuis un user non-callee');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);
  const new4 = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  const cid4 = new4.data?.call_id;
  const accSpoof = await curl('POST', `/api/calls/${cid4}/accept`, tOther);
  ok(accSpoof.status === 403, `accept tiers → 403 (got ${accSpoof.status})`);
  const accSelf = await curl('POST', `/api/calls/${cid4}/accept`, tPascal);
  ok(accSelf.status === 403, `accept caller (lui-même) → 403 (got ${accSelf.status})`);
  // cleanup
  await curl('POST', `/api/calls/${cid4}/hangup`, tPascal);

  console.log('\n# Test 5 — Anti-spoof : not_friends');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(otherUser.id);
  const newNF = await curl('POST', '/api/calls/new', tPascal, { callee_id: otherUser.id, kind: 'audio' });
  ok(newNF.status === 403 && newNF.data?.error === 'not_friends', `pas amis → 403 not_friends (got ${newNF.status} ${newNF.data?.error})`);

  console.log('\n# Test 6 — Rate limit ring_beat (1 beat/666ms)');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);
  const newRL = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  const cidRL = newRL.data?.call_id;
  const r1 = await curl('POST', `/api/calls/${cidRL}/ring_beat`, tKarim);
  const r2 = await curl('POST', `/api/calls/${cidRL}/ring_beat`, tKarim); // immédiat → 429
  ok(r1.status === 200 && r2.status === 429, `r1=${r1.status} r2=${r2.status} (attendu 200 puis 429)`);
  await curl('POST', `/api/calls/${cidRL}/hangup`, tPascal);

  console.log('\n# Test 7 — GET /api/calls/[id] resync');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);
  const new7 = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'video' });
  const cid7 = new7.data?.call_id;
  const getRes = await curl('GET', `/api/calls/${cid7}`, tKarim);
  ok(getRes.status === 200 && getRes.data?.call?.id === cid7 && getRes.data?.call?.kind === 'video',
     `GET /api/calls/[id] callee → 200 (state=${getRes.data?.call?.state} kind=${getRes.data?.call?.kind})`);
  // Other ne peut pas
  const getSpoof = await curl('GET', `/api/calls/${cid7}`, tOther);
  ok(getSpoof.status === 403, `GET tiers → 403 (got ${getSpoof.status})`);
  await curl('POST', `/api/calls/${cid7}/hangup`, tPascal);

  console.log('\n# Test 8 — callee_busy si Karim a déjà un appel actif');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);
  // Karim est appelé par Pascal (pour avoir un appel actif chez Karim)
  const callA = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  ok(callA.status === 200, `call A → ${callA.status}`);
  // Other essaie d'appeler Karim → 409 callee_busy
  // (mais d'abord il faut que Other soit ami avec Karim, sinon 403 not_friends arrive avant)
  ensureFriendship(otherUser.id, karim.id);
  const callB = await curl('POST', '/api/calls/new', tOther, { callee_id: karim.id, kind: 'audio' });
  ok(callB.status === 409 && callB.data?.error === 'callee_busy',
     `2nd call → 409 callee_busy (got ${callB.status} ${callB.data?.error})`);
  await curl('POST', `/api/calls/${callA.data.call_id}/hangup`, tPascal);

  console.log('\n# Test 9 — Webrtc relay nécessite state=accepted');
  purgeActiveCallsFor(pascal.id); purgeActiveCallsFor(karim.id);
  const new9 = await curl('POST', '/api/calls/new', tPascal, { callee_id: karim.id, kind: 'audio' });
  const cid9 = new9.data?.call_id;
  const rtcEarly = await curl('POST', `/api/calls/${cid9}/webrtc`, tPascal, { type: 'offer', payload: { type: 'offer', sdp: 'v=0' } });
  ok(rtcEarly.status === 409, `webrtc avant accept → 409 (got ${rtcEarly.status})`);
  await curl('POST', `/api/calls/${cid9}/accept`, tKarim);
  const rtcOk = await curl('POST', `/api/calls/${cid9}/webrtc`, tPascal, { type: 'offer', payload: { type: 'offer', sdp: 'v=0' } });
  ok(rtcOk.status === 200, `webrtc post-accept → 200 (got ${rtcOk.status})`);
  // Anti-spoof : Other ne peut pas relayer
  const rtcSpoof = await curl('POST', `/api/calls/${cid9}/webrtc`, tOther, { type: 'offer', payload: {} });
  ok(rtcSpoof.status === 403, `webrtc tiers → 403 (got ${rtcSpoof.status})`);
  await curl('POST', `/api/calls/${cid9}/hangup`, tPascal);

  console.log('\n# Cleanup');
  // Supprime les sessions test pour ne pas polluer
  db.prepare('DELETE FROM sessions WHERE token IN (?, ?, ?)').run(tPascal, tKarim, tOther);
  db.close();
  console.log('\n=== DONE ===');
})();
