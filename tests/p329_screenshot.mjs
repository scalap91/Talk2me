/**
 * Crée user + session, puis tire les 4 screenshots via puppeteer-service.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';

const db = new Database(DB_PATH);

function createUser() {
  const id = randomUUID();
  const username = 'p329shot_' + randomBytes(2).toString('hex');
  const email = `p329_${randomBytes(3).toString('hex')}@bizzi.test`;
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
  ).run(id, talk2meId, username, 'Pascal', email, now, now, 'T2M de Pascal');
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

async function shoot(url, out, w = 420, h = 880) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(w));
  u.searchParams.set('height', String(h));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', '2500');
  u.searchParams.set('cookieName', 'talk2me_session');
  u.searchParams.set('cookieValue', global.__TOKEN__);
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
  const u = createUser();
  const token = createSession(u.id);
  global.__TOKEN__ = token;
  console.log(`User ${u.username} session ${token.slice(0, 8)}…`);

  const HOST = 'http://127.0.0.1:3010';
  console.log('[shot 1] editor (vidéo chargée, pas d\'ops)');
  await shoot(`${HOST}/demo-p329?step=editor`, `${OUT_DIR}/talk2me_p329_video_editor.png`);
  console.log('[shot 2] trim 5–15s');
  await shoot(`${HOST}/demo-p329?step=trim`, `${OUT_DIR}/talk2me_p329_trim.png`);
  console.log('[shot 3] text overlay BONJOUR');
  await shoot(`${HOST}/demo-p329?step=text`, `${OUT_DIR}/talk2me_p329_text_overlay.png`);
  console.log('[shot 4] feed avec card publiée');
  await shoot(`${HOST}/home`, `${OUT_DIR}/talk2me_p329_published.png`);

  // Cleanup session
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
