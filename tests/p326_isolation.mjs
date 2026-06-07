/**
 * Talk2Me #326 — Test E2E isolation IA + cards riches + mémoire.
 *
 * Scénario :
 *  1. Crée 2 users (Pascal/Karim) + sessions directement en DB
 *  2. Crée la friendship + conv P2P via API
 *  3. Pascal change ai_gender=feminin + ai_name=Léa
 *  4. Karim change ai_gender=masculin + ai_name=Marcel
 *  5. Pascal @Léa vidéo Tokyo → YouTubeCard
 *  6. Karim @Marcel resto Lyon → PlaceCard
 *  7. Ajoute memory "Pascal aime le couscous"
 *  8. Pascal demande aide alimentaire → mémoire utilisée
 *  9. Karim demande aide alimentaire → AUCUNE info couscous (isolation)
 *
 * Pas de Playwright ici — on test côté API + DB. Screenshot fait à part.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';

const db = new Database(DB_PATH);

function uuid() { return randomUUID(); }
function uniqueEmail(prefix) {
  return `${prefix}_p326_${randomBytes(3).toString('hex')}@bizzi.test`;
}

function createUserDirect(email, displayName, username) {
  const now = Date.now();
  const id = uuid();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  const defaultAi = `T2M de ${displayName}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, displayName, email, now, now, defaultAi);
  // Create the agent conv
  const convId = uuid();
  db.prepare(
    `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'agent', ?)`
  ).run(convId, id, now, id);
  db.prepare(
    `INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`
  ).run(convId, id, now);
  return { id, talk2me_id: talk2meId, username, display_name: displayName, email };
}

function createSession(userId) {
  const token = uuid();
  const now = Date.now();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token, userId, now, expires
  );
  return token;
}

async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Cookie'] = `talk2me_session=${token}`;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  return { status: res.status, json };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const results = {};
function record(name, ok, detail) {
  results[name] = { ok, detail };
  const icon = ok ? 'OK' : 'KO';
  console.log(`[${icon}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log('=== Talk2Me #326 E2E — Isolation IA + Cards + Memory ===\n');

  // 1. CREATE USERS + SESSIONS
  const pascal = createUserDirect(uniqueEmail('pascal'), 'Pascal', `pascal_${randomBytes(2).toString('hex')}`);
  const karim = createUserDirect(uniqueEmail('karim'), 'Karim', `karim_${randomBytes(2).toString('hex')}`);
  const pT = createSession(pascal.id);
  const kT = createSession(karim.id);
  console.log(`Pascal id=${pascal.id} token=${pT.slice(0, 12)}…`);
  console.log(`Karim id=${karim.id} token=${kT.slice(0, 12)}…\n`);

  // 2. RENAME AI + GENDER
  let r = await api('/api/users/me/ai-name', { method: 'POST', body: JSON.stringify({ ai_name: 'Léa' }) }, pT);
  record('rename_ai_pascal_lea', r.status === 200 && r.json?.ai_name === 'Léa', JSON.stringify(r.json));
  r = await api('/api/users/me/ai-gender', { method: 'POST', body: JSON.stringify({ ai_gender: 'feminin' }) }, pT);
  record('set_pascal_gender_feminin', r.status === 200, JSON.stringify(r.json));
  r = await api('/api/users/me/ai-name', { method: 'POST', body: JSON.stringify({ ai_name: 'Marcel' }) }, kT);
  record('rename_ai_karim_marcel', r.status === 200 && r.json?.ai_name === 'Marcel', JSON.stringify(r.json));
  r = await api('/api/users/me/ai-gender', { method: 'POST', body: JSON.stringify({ ai_gender: 'masculin' }) }, kT);
  record('set_karim_gender_masculin', r.status === 200, JSON.stringify(r.json));

  // 3. FRIENDSHIP (direct DB pour simplifier)
  const fid = uuid();
  const [a, b] = pascal.id < karim.id ? [pascal.id, karim.id] : [karim.id, pascal.id];
  db.prepare('INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fid, a, b, 'accepted', Date.now());

  // 4. CREATE P2P CONV
  r = await api('/api/conversations/create-p2p', { method: 'POST', body: JSON.stringify({ friend_id: karim.id }) }, pT);
  record('create_p2p_conv', r.status === 200 && !!r.json?.conversation?.id, JSON.stringify(r.json).slice(0, 200));
  const convId = r.json?.conversation?.id;
  if (!convId) {
    console.error('No conv id, abort');
    process.exit(1);
  }

  // 5. PASCAL → @Léa cherche vidéo Tokyo
  console.log('\n--- Test #1 : Pascal @Léa vidéo Tokyo ---');
  r = await api(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: '@Léa cherche-moi une vidéo sur Tokyo' }),
  }, pT);
  record('pascal_send_lea_youtube', r.status === 200 && r.json?.ai_triggered === true, `ai_triggered=${r.json?.ai_triggered}`);

  // Attendre l'IA async
  console.log('Waiting 25s for Léa to respond (tool call + persist)...');
  await sleep(25000);

  // Lire les messages
  r = await api(`/api/conversations/${convId}`, {}, pT);
  const msgs1 = r.json?.messages || [];
  const leaReply = msgs1.find(m => m.kind === 'ai_reply' && m.ai_name === 'Léa');
  record('lea_reply_persisted', !!leaReply, `aiName=${leaReply?.ai_name} hasYoutube=${!!leaReply?.youtube}`);
  record('lea_youtube_card_rich', !!leaReply?.youtube?.video_id, `videoId=${leaReply?.youtube?.video_id} title="${leaReply?.youtube?.title?.slice(0,40)}…"`);
  // Anti-markdown
  const textHasMd = leaReply?.content && /\*\*|\[.*\]\(.*\)|^#|```/.test(leaReply.content);
  record('lea_no_markdown', !textHasMd, `text="${leaReply?.content?.slice(0,80)}…"`);

  // 6. KARIM → @Marcel resto Lyon
  console.log('\n--- Test #2 : Karim @Marcel resto Lyon ---');
  r = await api(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: '@Marcel cherche-moi un restaurant à Lyon' }),
  }, kT);
  record('karim_send_marcel_resto', r.status === 200 && r.json?.ai_triggered === true);

  console.log('Waiting 25s for Marcel to respond...');
  await sleep(25000);

  r = await api(`/api/conversations/${convId}`, {}, kT);
  const msgs2 = r.json?.messages || [];
  const marcelReply = msgs2.find(m => m.kind === 'ai_reply' && m.ai_name === 'Marcel');
  record('marcel_reply_persisted', !!marcelReply, `aiName=${marcelReply?.ai_name} placesCount=${marcelReply?.places?.length || 0}`);
  const hasMarcelPlaces = Array.isArray(marcelReply?.places) && marcelReply.places.length > 0;
  record('marcel_places_card', hasMarcelPlaces, `places=${marcelReply?.places?.length || 0}`);

  // 7. ISOLATION : les 2 IA ont des noms distincts
  const leaCount = msgs2.filter(m => m.ai_name === 'Léa').length;
  const marcelCount = msgs2.filter(m => m.ai_name === 'Marcel').length;
  record('ai_names_distinct', leaCount > 0 && marcelCount > 0, `Léa=${leaCount} Marcel=${marcelCount}`);
  const aiForUserCorrect = msgs2.filter(m => m.ai_name === 'Léa').every(m => m.ai_for_user_id === pascal.id)
    && msgs2.filter(m => m.ai_name === 'Marcel').every(m => m.ai_for_user_id === karim.id);
  record('ai_for_user_isolation', aiForUserCorrect, `chaque IA reliée à son owner`);

  // 8. AJOUT MEMORY Pascal
  console.log('\n--- Test #3 : Memory Pascal (couscous) ---');
  r = await api('/api/users/me/memories', {
    method: 'POST',
    body: JSON.stringify({ content: 'Pascal aime énormément le couscous marocain et préfère qu\'on lui propose ce plat quand on parle de nourriture.', kind: 'preference' }),
  }, pT);
  record('memory_add_pascal_couscous', r.status === 200 && !!r.json?.memory?.id, JSON.stringify(r.json).slice(0, 200));

  r = await api('/api/users/me/memories', {}, pT);
  record('memory_list_pascal', Array.isArray(r.json?.memories) && r.json.memories.length > 0, `count=${r.json?.memories?.length}`);

  r = await api('/api/users/me/memories', {}, kT);
  record('memory_isolation_karim_empty', Array.isArray(r.json?.memories) && r.json.memories.length === 0, `karim memories count=${r.json?.memories?.length}`);

  // 9. PASCAL demande "j'ai faim" → IA doit mentionner couscous
  console.log('\n--- Test #4 : Pascal alimentaire → mémoire couscous ---');
  r = await api(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: '@Léa j\'ai très faim ce soir, qu\'est-ce que tu me conseilles de manger ?' }),
  }, pT);
  record('pascal_send_food_question', r.status === 200 && r.json?.ai_triggered === true);

  console.log('Waiting 25s for Léa...');
  await sleep(25000);
  r = await api(`/api/conversations/${convId}`, {}, pT);
  const msgs3 = r.json?.messages || [];
  // Most recent ai_reply Léa with content mentioning couscous
  const leaFoodReplies = msgs3.filter(m => m.kind === 'ai_reply' && m.ai_name === 'Léa');
  const latestLea = leaFoodReplies[leaFoodReplies.length - 1];
  const mentionsCouscous = /couscous/i.test(latestLea?.content || '');
  record('lea_uses_pascal_memory', mentionsCouscous, `lastLeaText="${latestLea?.content?.slice(0,120)}…"`);

  // 10. KARIM demande alimentaire → AUCUN couscous (isolation)
  console.log('\n--- Test #5 : Karim alimentaire → isolation (PAS de couscous) ---');
  r = await api(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: '@Marcel j\'ai faim, qu\'est-ce que tu me conseilles ?' }),
  }, kT);
  record('karim_send_food_question', r.status === 200);

  console.log('Waiting 25s for Marcel...');
  await sleep(25000);
  r = await api(`/api/conversations/${convId}`, {}, kT);
  const msgs4 = r.json?.messages || [];
  const marcelFoodReplies = msgs4.filter(m => m.kind === 'ai_reply' && m.ai_name === 'Marcel');
  const latestMarcel = marcelFoodReplies[marcelFoodReplies.length - 1];
  const marcelMentionsCouscous = /couscous/i.test(latestMarcel?.content || '');
  record('marcel_isolated_no_couscous', !marcelMentionsCouscous, `lastMarcelText="${latestMarcel?.content?.slice(0,120)}…"`);

  console.log('\n=== FIN ===');
  console.log('PASCAL_TOKEN=' + pT);
  console.log('KARIM_TOKEN=' + kT);
  console.log('CONV_ID=' + convId);
  console.log('PASCAL_ID=' + pascal.id);
  console.log('KARIM_ID=' + karim.id);

  const summary = Object.entries(results).map(([k, v]) => `${v.ok ? 'OK' : 'KO'} ${k}`).join('\n');
  console.log('\nSUMMARY:\n' + summary);

  // Persist tokens for the Playwright step
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/p326_state.json', JSON.stringify({
    pascalToken: pT,
    karimToken: kT,
    convId,
    pascalId: pascal.id,
    karimId: karim.id,
    pascalUsername: pascal.username,
    karimUsername: karim.username,
    results,
  }, null, 2));

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
