/**
 * Screenshots Lot 1bis Couche B — Talk2Me #340 (Pascal 2026-06-04).
 *
 * Pour chaque scénario :
 *  1. Crée user + session
 *  2. POST /api/chat avec le scénario
 *  3. Ouvre /c/<convId> dans Puppeteer + screenshot
 *
 * Génère 3 PNG dans /home/ubuntu/dashboard/uploads/.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const HOST = 'http://127.0.0.1:3010';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';

const db = new Database(DB_PATH);

function createUser() {
  const id = randomUUID();
  const username = 'l1bis_' + randomBytes(2).toString('hex');
  const email = `l1bis_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'feminin')`
  ).run(id, talk2meId, username, 'Pascal', email, now, now, 'Léa');
  return { id, username };
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

async function postChat(token, message, mode) {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `talk2me_session=${token}`,
  };
  if (mode) headers['x-talktome-mode'] = mode;
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`/api/chat ${r.status}`);
  return await r.json();
}

async function shoot(url, out, token, w = 420, h = 1000) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(w));
  u.searchParams.set('height', String(h));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', '3000');
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

  // === Test 1: hotel Évry → fix ===
  {
    const u = createUser();
    const token = createSession(u.id);
    console.log(`[T1] user=${u.username} token=${token.slice(0, 8)}…`);
    const r = await postChat(token, 'Trouve-moi un hôtel à Évry');
    console.log('  /api/chat:', JSON.stringify({
      text: r.text?.slice(0, 100),
      web_search_count: r.web_search?.results?.length || 0,
      places_count: r.places?.length || 0,
    }));
    await new Promise((res) => setTimeout(res, 1500));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_consciousness_l1bis_hotel_evry_fix.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  // === Test 2: no pipeline leak (mets-moi Check) ===
  {
    const u = createUser();
    const token = createSession(u.id);
    console.log(`[T2] user=${u.username} token=${token.slice(0, 8)}…`);
    // Pré-load une mémoire user "écoute du rap" pour désambiguïser
    db.prepare(
      `INSERT INTO ai_memories (id, user_id, kind, content, weight, created_at) VALUES (?, ?, 'preference', ?, 1.0, ?)`
    ).run(randomUUID(), u.id, 'écoute du rap (Young Thug, Future)', Date.now());
    const r = await postChat(token, 'Mets-moi Check');
    console.log('  /api/chat:', JSON.stringify({
      text: r.text?.slice(0, 200),
      youtube_title: r.youtube?.title,
    }));
    await new Promise((res) => setTimeout(res, 1500));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_consciousness_l1bis_no_pipeline_leak.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  // === Test 3: identité ===
  {
    const u = createUser();
    const token = createSession(u.id);
    console.log(`[T3] user=${u.username} token=${token.slice(0, 8)}…`);
    const r = await postChat(token, 'Qui es-tu ?');
    console.log('  /api/chat:', JSON.stringify({
      text: r.text?.slice(0, 300),
    }));
    await new Promise((res) => setTimeout(res, 1500));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_consciousness_l1bis_identity.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
