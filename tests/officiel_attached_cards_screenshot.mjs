/**
 * Talk2Me T2M Officiel cards attachées — Screenshot (Pascal 2026-06-05).
 *
 * Crée une conv P2P avec T2M Officiel, envoie un message qui va déclencher
 * search_db_posts / get_buzz_cards / get_top_posts (donc enrichissement
 * UnifiedCards), attend la réponse, puis screenshot la conv pour preuve
 * visuelle que les cards apparaissent SOUS la bulle texte de T2M Officiel.
 *
 * Bug fix Pascal verbatim : "cest surtout il ne sait pas me ressevir en
 * card dorigine le contenue quil a citer".
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
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
  const username = 'cards_' + randomBytes(2).toString('hex');
  const email = `cards_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  const talk2meId = makeTalk2MeId();
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`,
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
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, now + 24 * 60 * 60 * 1000);
  return token;
}

function createConvP2P(meId, peerId) {
  const cid = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'p2p', ?, ?, ?)",
  ).run(cid, meId, now, meId, '', now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)',
  ).run(cid, meId, now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)',
  ).run(cid, peerId, now);
  return cid;
}

async function postMessage(convId, token, text) {
  const r = await fetch(`${HOST}/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify({ text }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function shoot(url, out, token, opts = {}) {
  const w = opts.w || 390;
  const h = opts.h || 1100;
  const wait = opts.wait || 5500;
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(w));
  u.searchParams.set('height', String(h));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', String(wait));
  u.searchParams.set('cookieName', 'talk2me_session');
  u.searchParams.set('cookieValue', token);
  u.searchParams.set('cookieDomain', '127.0.0.1');
  const r = await fetch(u);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`puppeteer ${r.status}: ${txt}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(out, buf);
  console.log(`  saved ${out} (${buf.length} bytes)`);
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const me = createUser('PascalCardsTest');
  const token = createSession(me.id);
  console.log(
    `[user] ${me.username} talk2me_id=${me.talk2meId} session=${token.slice(0, 8)}…`,
  );

  const conv = createConvP2P(me.id, T2M_OFFICIEL_USER_ID);
  console.log(`[conv] p2p T2M Officiel : ${conv}`);

  // Envoie 2 messages successifs pour avoir un mix d'attached_cards
  console.log("\n[step 1] POST 'Montre-moi ce qui buzz en ce moment'");
  const r1 = await postMessage(conv, token, 'Montre-moi ce qui buzz en ce moment');
  console.log(`  → HTTP ${r1.status} officiel_triggered=${r1.body?.officiel_triggered}`);

  // attendre la réponse async
  console.log('  attente 10s pour DeepSeek + enrich…');
  await new Promise((res) => setTimeout(res, 10000));

  console.log("\n[step 2] POST 'Top vues cette semaine ?'");
  const r2 = await postMessage(conv, token, 'Top vues cette semaine ?');
  console.log(`  → HTTP ${r2.status} officiel_triggered=${r2.body?.officiel_triggered}`);

  console.log('  attente 10s pour DeepSeek + enrich…');
  await new Promise((res) => setTimeout(res, 10000));

  // Inspecte la DB pour confirmer attached_cards
  const dbCheck = new Database(DB_PATH, { readonly: true });
  const rows = dbCheck
    .prepare(
      `SELECT id, text, attached_cards, created_at FROM messages
         WHERE conversation_id = ? AND ai_for_user_id = ?
         ORDER BY created_at ASC`,
    )
    .all(conv, T2M_OFFICIEL_USER_ID);
  console.log('\n[db check] messages T2M Officiel persistés :');
  for (const r of rows) {
    let n = 0;
    try {
      const arr = r.attached_cards ? JSON.parse(r.attached_cards) : null;
      if (Array.isArray(arr)) n = arr.length;
    } catch {}
    console.log(
      `  - id=${r.id.slice(0, 8)}… cards=${n} text="${(r.text || '').slice(0, 90)}"`,
    );
  }
  dbCheck.close();

  // Screenshot conv
  console.log('\n[screenshot] conv T2M Officiel avec cards attachées');
  await shoot(
    `${HOST}/c/${conv}`,
    `${OUT_DIR}/talk2me_t2m_officiel_cards_attached.png`,
    token,
    { wait: 6000, h: 1400 },
  );

  // Cleanup session (garde le user pour debug)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
  console.log('\ndone.');
  db.close();
})();
