/**
 * Talk2Me #386 — Test e2e bulles T2M Officiel.
 *
 * Vérifie les 3 fixes (Pascal 2026-06-05) :
 *  A) bulles T2M Officiel rendues à GAUCHE en peer-ai (gris/neutre)
 *     même si me.id === T2M_OFFICIEL_USER_ID
 *  B) header "T2M Officiel" séparé visuellement du quoted preview
 *     (pas de confusion "PASCAL.REPIR" pris comme auteur)
 *  C) anti-boucle : 1 message user → 1 réponse, pas de re-trigger via tag
 *     halluciné dans la réponse officielle
 *
 * Crée un user Pascal, ouvre une conv P2P avec T2M Officiel, envoie un
 * "Salut" et capture l'état rendu + un screenshot.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = process.cwd() + '/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';
const HOST = 'http://127.0.0.1:3010';
const T2M_OFFICIEL_USER_ID = '8f508701-fbdb-460f-bd95-e826873f79e1';

const db = new Database(DB_PATH);

function makeTalk2MeId() {
  for (let i = 0; i < 50; i++) {
    const id = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(id);
    if (!exists) return id;
  }
  throw new Error('cannot generate unique talk2me_id');
}

function createUser(displayName) {
  const id = randomUUID();
  const username = 'p386_' + randomBytes(2).toString('hex');
  const email = `p386_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  const talk2meId = makeTalk2MeId();
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(
    id,
    talk2meId,
    username,
    displayName,
    email,
    now,
    now,
    `T2M de ${displayName}`,
  );
  return { id, username, displayName, talk2meId };
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

function createConvP2P(meId, peerId) {
  const cid = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'p2p', ?, ?, ?)"
  ).run(cid, meId, now, meId, '', now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, meId, now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, peerId, now);
  return cid;
}

async function shoot(url, out, token, opts = {}) {
  const w = opts.w || 390;
  const h = opts.h || 844;
  const wait = opts.wait || 3500;
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(w));
  u.searchParams.set('height', String(h));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', String(wait));
  u.searchParams.set('cookieName', 'talk2me_session');
  u.searchParams.set('cookieValue', token);
  u.searchParams.set('cookieDomain', '127.0.0.1');
  if (opts.scrollY) u.searchParams.set('scrollY', String(opts.scrollY));
  const r = await fetch(u);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`puppeteer ${r.status}: ${txt}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(out, buf);
  console.log(`  saved ${out} (${buf.length} bytes)`);
}

async function postMessage(host, convId, token, text) {
  const r = await fetch(`${host}/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify({ text }),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

async function getMessages(host, convId, token) {
  const r = await fetch(`${host}/api/conversations/${convId}`, {
    headers: { Cookie: `talk2me_session=${token}` },
  });
  return r.json();
}

function tally(messages) {
  const out = { total: messages.length, user: 0, ai_reply: 0 };
  for (const m of messages) {
    if (m.kind === 'ai_reply') out.ai_reply += 1;
    else out.user += 1;
  }
  return out;
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const me = createUser('Pascal.repir');
  const token = createSession(me.id);
  console.log(`[user] ${me.username} talk2me_id=${me.talk2meId} session=${token.slice(0, 8)}…`);

  const conv = createConvP2P(me.id, T2M_OFFICIEL_USER_ID);
  console.log(`[conv] p2p avec T2M Officiel : ${conv}`);

  // === Test 1 : message simple sans tag ===
  console.log("\n[test 1] POST 'Ça va bro' (sans tag IA perso)");
  const r1 = await postMessage(HOST, conv, token, 'Ça va bro');
  console.log(`  → HTTP ${r1.status} officiel_triggered=${r1.body?.officiel_triggered}`);

  // attendre la réponse async T2M Officiel (DeepSeek)
  console.log('  attente 12s pour la réponse T2M Officiel…');
  await new Promise((res) => setTimeout(res, 12000));

  const m1 = await getMessages(HOST, conv, token);
  const t1 = tally(m1.messages);
  console.log(`  messages: total=${t1.total} user=${t1.user} ai_reply=${t1.ai_reply}`);

  // Vérifs Bug C
  const officielReplies = m1.messages.filter(
    (m) => m.kind === 'ai_reply' && m.ai_for_user_id === T2M_OFFICIEL_USER_ID,
  );
  console.log(`  T2M Officiel ai_reply: ${officielReplies.length}`);
  for (const rep of officielReplies) {
    console.log(`    - ai_name="${rep.ai_name}" text="${(rep.content || '').slice(0, 80)}"`);
    if (/@T2M\s+de\s+\S+/i.test(rep.content || '')) {
      console.warn(`    ⚠ REPLY contient un tag IA perso !`);
    }
  }

  // Screenshot état conv après réponse
  console.log('\n[screenshot] conv après réponse T2M Officiel');
  await shoot(
    `${HOST}/c/${conv}`,
    `${OUT_DIR}/talk2me_t2m_officiel_conv_fixed.png`,
    token,
    { wait: 4000 },
  );

  // === Test 2 : Pascal tape "@T2M de Pascal.repir réponds" (tag IA perso)
  //     dans la conv T2M Officiel. Doit prioritiser IA perso, pas re-trigger officiel.
  console.log("\n[test 2] POST '@T2M de Pascal.repir réponds' (tag IA perso en conv officiel)");
  const r2 = await postMessage(HOST, conv, token, '@T2M de Pascal.repir réponds');
  console.log(`  → HTTP ${r2.status} officiel_triggered=${r2.body?.officiel_triggered} ai_triggered=${r2.body?.ai_triggered}`);
  if (r2.body?.officiel_triggered) {
    console.warn('  ⚠ T2M Officiel a été re-déclenché alors que tag perso présent !');
  }

  // attendre IA perso
  console.log('  attente 12s pour IA perso…');
  await new Promise((res) => setTimeout(res, 12000));
  const m2 = await getMessages(HOST, conv, token);
  const t2 = tally(m2.messages);
  console.log(`  messages: total=${t2.total} user=${t2.user} ai_reply=${t2.ai_reply}`);

  const newOfficiel = m2.messages.filter(
    (m) => m.kind === 'ai_reply' && m.ai_for_user_id === T2M_OFFICIEL_USER_ID,
  );
  const persoReplies = m2.messages.filter(
    (m) => m.kind === 'ai_reply' && m.ai_for_user_id === me.id,
  );
  console.log(`  T2M Officiel total: ${newOfficiel.length} | T2M Pascal perso: ${persoReplies.length}`);

  // Verdict
  console.log('\n=== VERDICT ===');
  const pass = {
    bugC_single_officiel: officielReplies.length === 1,
    bugC_no_self_tag: officielReplies.every(
      (r) => !/@T2M\s+de\s+\S+|@\w+\s+réponds?/i.test(r.content || ''),
    ),
    bugC_priority_perso: !r2.body?.officiel_triggered && r2.body?.ai_triggered === true,
    perso_responded: persoReplies.length >= 1,
  };
  for (const [k, v] of Object.entries(pass)) {
    console.log(`  ${v ? 'OK' : 'KO'} ${k}`);
  }

  // Cleanup session uniquement (on garde les seeds pour debug)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
  console.log('\ndone.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
