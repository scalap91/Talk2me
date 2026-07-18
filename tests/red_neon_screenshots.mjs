/**
 * Talk2Me — Rouge néon (#ff3344) screenshots after theme migration.
 *
 * Crée user + session + seed minimaliste, puis tire 3 screenshots :
 *   - talk2me_red_neon_home    : feed Home (cards + BottomNav + bouton + central)
 *   - talk2me_red_neon_conv    : conv IA solo (bulle user + UI agent)
 *   - talk2me_red_neon_profile : page profil (boutons accents)
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = process.cwd() + '/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';
const HOST = 'http://127.0.0.1:3010';

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
  const username = 'red_' + randomBytes(2).toString('hex');
  const email = `red_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  const talk2meId = makeTalk2MeId();
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, displayName, email, now, now, `T2M de ${displayName}`);
  return { id, username, displayName };
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

function createConv(userId) {
  const cid = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'agent', ?, ?, ?)"
  ).run(cid, userId, now, userId, 'salut', now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, userId, now);
  return cid;
}

function insertMessage(convId, role, text) {
  const mid = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, text, links, created_at, requires_geoloc, kind)
     VALUES (?, ?, ?, ?, '[]', ?, 0, 'user')`
  ).run(mid, convId, role, text, now);
  return mid;
}

function createTexteCard(userId, text, bg) {
  const id = randomUUID();
  const ts = Date.now() - 5 * 60_000;
  db.prepare(
    `INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, created_at, likes, views, share_count, save_count, comment_count)
     VALUES (?, ?, 'texte', NULL, NULL, ?, ?, ?, 41, 312, 0, 0, 0)`
  ).run(id, userId, text, bg, ts);
  return id;
}

async function shoot(url, out, opts = {}) {
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
  u.searchParams.set('cookieValue', global.__TOKEN__);
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

(async () => {
  await mkdir(OUT_DIR, { recursive: true });

  const me = createUser('Pascal');
  const token = createSession(me.id);
  global.__TOKEN__ = token;
  console.log(`User ${me.username} session ${token.slice(0, 8)}…`);

  // Seed feed : texte card "purple" variant (devenu rouge néon)
  createTexteCard(me.id, 'Rouge néon, validé par Pascal #ff3344', 'purple');
  createTexteCard(me.id, 'On ne devient pas ce qu’on rêve. On devient ce qu’on fait.', 'neutral');

  // Seed conv : message user + IA
  const conv = createConv(me.id);
  insertMessage(conv, 'user', 'Salut, montre-moi le nouveau thème rouge néon');
  insertMessage(conv, 'agent', 'Voici le thème rouge néon (#ff3344) appliqué partout dans Talk2Me. Tout ce qui était violet est désormais en rouge signal.');

  // 1) Home feed
  console.log('[1/3] Home feed');
  await shoot(`${HOST}/home`, `${OUT_DIR}/talk2me_red_neon_home.png`, { wait: 4500 });

  // 2) Conversation IA solo
  console.log('[2/3] Conv IA solo');
  await shoot(`${HOST}/c/${conv}`, `${OUT_DIR}/talk2me_red_neon_conv.png`, { wait: 4500 });

  // 3) Profil
  console.log('[3/3] Profil');
  await shoot(`${HOST}/profile`, `${OUT_DIR}/talk2me_red_neon_profile.png`, { wait: 4500 });

  // Cleanup session
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
