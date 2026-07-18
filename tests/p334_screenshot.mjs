/**
 * Talk2Me #334 — Refonte BottomNav 5 items + CardCreationSheet + /friends hub + /drafts.
 * Crée user + session + données seed, puis tire 4 screenshots via puppeteer-service.
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
  const username = 'p334_' + randomBytes(2).toString('hex');
  const email = `p334_${randomBytes(3).toString('hex')}@bizzi.test`;
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

function createAgentConv(userId) {
  const cid = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'agent', ?, ?, ?)"
  ).run(cid, userId, now, userId, 'Salut Pascal ! On regarde ta journée ?', now - 5 * 60_000);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, userId, now);
  return cid;
}

function addFriendship(uA, uB) {
  const [a, b] = uA < uB ? [uA, uB] : [uB, uA];
  db.prepare(
    "INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at) VALUES (?, ?, ?, 'accepted', ?)"
  ).run(randomUUID(), a, b, Date.now());
}

function createP2PConv(uA, uB, preview, ts) {
  const cid = randomUUID();
  const now = ts || Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'p2p', ?, ?, ?)"
  ).run(cid, uA, now, uA, preview, now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, uA, now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, uB, now);
  return cid;
}

function createDraft(userId, type, draftData, thumbUrl, title) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO card_drafts (id, user_id, type, draft_data, thumbnail_url, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, type, JSON.stringify(draftData), thumbUrl, title, now - 10000, now);
  return id;
}

async function shoot(url, out, w = 420, h = 880, opts = {}) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(w));
  u.searchParams.set('height', String(h));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', String(opts.wait || 2500));
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

  // 1) User principal + 2 amis pour /friends
  const me = createUser('Pascal');
  const ami1 = createUser('Karim');
  const ami2 = createUser('Sophie');
  const token = createSession(me.id);
  global.__TOKEN__ = token;

  addFriendship(me.id, ami1.id);
  addFriendship(me.id, ami2.id);

  // 2) Conv agent IA solo (pinned en haut)
  createAgentConv(me.id);

  // 3) 2 conversations P2P avec previews
  createP2PConv(
    me.id,
    ami1.id,
    'On se voit samedi pour le café ?',
    Date.now() - 25 * 60_000
  );
  createP2PConv(
    me.id,
    ami2.id,
    'Trop fort le concert hier 🎶',
    Date.now() - 3 * 3600_000
  );

  // 4) 3 brouillons de cards (image, video, texte)
  createDraft(
    me.id,
    'image',
    {
      type: 'image',
      source_url: '/uploads/p329_sample.mp4', // placeholder, le thumb suffit
      crop: 'square',
      filter: 'warm',
      texts: [],
      title: 'Sunset Paris',
      description: 'Petit moment magique sur les quais',
      hashtags: ['paris', 'sunset'],
      cover_url: null,
    },
    null,
    'Sunset Paris'
  );
  createDraft(
    me.id,
    'video',
    {
      type: 'video',
      source_url: '/uploads/p329_sample.mp4',
      crop: 'original',
      filter: 'none',
      texts: [{ id: 't1', content: 'BONJOUR', position: 'top', x_pct: 50, y_pct: 10, fontSize: 28, color: '#fff' }],
      title: 'Vibes du matin',
      description: 'Café et soleil',
      hashtags: ['matin', 'vibes'],
      cover_url: null,
      duration_s: 30,
      trim: { start_s: 5, end_s: 15 },
      cover_time_s: 3,
    },
    '/uploads/p329_sample.mp4',
    'Vibes du matin'
  );
  createDraft(
    me.id,
    'texte',
    {
      text: 'On ne devient pas ce qu’on rêve. On devient ce qu’on fait.',
      bg_variant: 'purple',
    },
    null,
    'On ne devient pas ce qu’on rêve. On devient ce qu’on fait.'
  );

  console.log(`User ${me.username} (${me.id.slice(0,8)}) session ${token.slice(0, 8)}…`);

  console.log('[shot 1] BottomNav 5 items (page /home)');
  await shoot(`${HOST}/home`, `${OUT_DIR}/talk2me_p334_bottomnav.png`);

  console.log('[shot 2] CardCreationSheet (Photo/Vidéo/Texte)');
  await shoot(
    `${HOST}/home?openSheet=1`,
    `${OUT_DIR}/talk2me_p334_creation_sheet.png`,
    420,
    880,
    { wait: 3500 }
  );

  console.log('[shot 3] /friends hub (IA pinned + P2P)');
  await shoot(`${HOST}/friends`, `${OUT_DIR}/talk2me_p334_friends_hub.png`);

  console.log('[shot 4] /drafts (3 brouillons)');
  await shoot(`${HOST}/drafts`, `${OUT_DIR}/talk2me_p334_drafts.png`);

  // Cleanup
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
