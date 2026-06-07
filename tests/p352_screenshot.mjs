/**
 * Talk2Me #352 — Refactor cards /home 100% viewport (TikTok-style).
 *
 * Crée user + session + seed feed mixte (post YT, image, video, texte),
 * puis tire les 5 screenshots imposés par Pascal :
 *   - refactor_youtube   : 1ère card = post YouTube fill viewport
 *   - refactor_image     : ImageCard fill + overlay caption bas
 *   - refactor_video     : VideoCard fill + overlay caption bas
 *   - refactor_texte     : TexteCard fill + texte centré
 *   - refactor_scroll    : pendant scroll (à mi-chemin entre 2 cards)
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
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
  const username = 'p352_' + randomBytes(2).toString('hex');
  const email = `p352_${randomBytes(3).toString('hex')}@bizzi.test`;
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

function createConv(userId) {
  const cid = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'agent', ?, ?, ?)"
  ).run(cid, userId, now, userId, 'seed', now);
  db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(cid, userId, now);
  return cid;
}

function insertMessage(convId, role, text, opts = {}) {
  const mid = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, text, links, created_at, youtube, places, requires_geoloc, recipe, intent_query, intent_label_fr, user_lat, user_lng, web_search, kind)
     VALUES (?, ?, ?, ?, '[]', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'user')`
  ).run(
    mid, convId, role, text, now,
    opts.youtube ? JSON.stringify(opts.youtube) : null,
    opts.places ? JSON.stringify(opts.places) : null,
    opts.recipe ? JSON.stringify(opts.recipe) : null,
    opts.intent_query ?? null,
    opts.intent_label_fr ?? null,
    opts.user_lat ?? null,
    opts.user_lng ?? null,
    opts.web_search ? JSON.stringify(opts.web_search) : null,
  );
  return mid;
}

function createPost(userId, convId, messageIds, ageMinutes = 5) {
  const pid = randomUUID();
  const ts = Date.now() - ageMinutes * 60_000;
  db.prepare(
    `INSERT INTO posts (id, user_id, conversation_id, message_ids, created_at, likes, views)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(pid, userId, convId, JSON.stringify(messageIds), ts, 12, 84);
  return pid;
}

function createDirectCard(userId, type, fields, ageMinutes = 10) {
  const id = randomUUID();
  const ts = Date.now() - ageMinutes * 60_000;
  db.prepare(
    `INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, created_at, likes, views, share_count, save_count, comment_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`
  ).run(
    id, userId, type,
    fields.media_url ?? null,
    fields.caption ?? null,
    fields.text ?? null,
    fields.bg_variant ?? null,
    ts,
    fields.likes ?? 7,
    fields.views ?? 42,
  );
  return id;
}

async function shoot(url, out, opts = {}) {
  const w = opts.w || 390;
  const h = opts.h || 844;
  const wait = opts.wait || 2500;
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

  const conv = createConv(me.id);

  // === 1) POST YouTube (1 message agent avec yt card) ===
  const mYt = insertMessage(
    conv,
    'agent',
    'Voici une vidéo qui devrait te plaire.',
    {
      youtube: {
        video_id: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channel: 'Rick Astley',
        description: 'The official music video for Never Gonna Give You Up.',
      },
    },
  );
  const postYt = createPost(me.id, conv, [mYt], 2);

  // === 2) ImageCard (photo carrée) ===
  const imgCard = createDirectCard(me.id, 'image', {
    media_url: '/uploads/2f60230f-781b-4788-aa25-6cd0a95e40f0.jpg',
    caption: 'Coucher de soleil sur les quais, juin 2026.',
    likes: 23,
    views: 187,
  }, 15);

  // === 3) VideoCard ===
  const vidCard = createDirectCard(me.id, 'video', {
    media_url: '/uploads/27d41e7c-b9b9-48a2-ae46-faa1be75f084.mp4',
    caption: 'Petit moment musical du matin 🎶',
    likes: 18,
    views: 142,
  }, 20);

  // === 4) TexteCard ===
  const txCard = createDirectCard(me.id, 'texte', {
    text: 'On ne devient pas ce qu’on rêve. On devient ce qu’on fait.',
    bg_variant: 'purple',
    likes: 41,
    views: 312,
  }, 25);

  console.log(`User ${me.username} session ${token.slice(0, 8)}…`);
  console.log(`Seeded postYt=${postYt.slice(0,8)} img=${imgCard.slice(0,8)} vid=${vidCard.slice(0,8)} tx=${txCard.slice(0,8)}`);

  // === Screenshots ===
  // 1) Première card en haut = YouTube post → fill viewport
  console.log('[1/5] YouTube post (top of feed)');
  await shoot(
    `${HOST}/home`,
    `${OUT_DIR}/talk2me_home_refactor_youtube.png`,
    { wait: 4000 },
  );

  // 2) Image card : scroll d'1 viewport = card #2 (img)
  console.log('[2/5] ImageCard (scrollY = 1×viewport)');
  await shoot(
    `${HOST}/home`,
    `${OUT_DIR}/talk2me_home_refactor_image.png`,
    { wait: 4000, scrollY: 724 },
  );

  // 3) Video card : scroll de 2 viewports
  console.log('[3/5] VideoCard (scrollY = 2×viewport)');
  await shoot(
    `${HOST}/home`,
    `${OUT_DIR}/talk2me_home_refactor_video.png`,
    { wait: 4000, scrollY: 724 * 2 },
  );

  // 4) Texte card : scroll de 3 viewports
  console.log('[4/5] TexteCard (scrollY = 3×viewport)');
  await shoot(
    `${HOST}/home`,
    `${OUT_DIR}/talk2me_home_refactor_texte.png`,
    { wait: 4000, scrollY: 724 * 3 },
  );

  // 5) Scroll au milieu (entre carte 1 et carte 2) — pas de gap noir attendu
  console.log('[5/5] Scroll intermédiaire (scrollY = 0.5×viewport)');
  await shoot(
    `${HOST}/home`,
    `${OUT_DIR}/talk2me_home_refactor_scroll.png`,
    { wait: 4000, scrollY: 362 },
  );

  // Cleanup session uniquement (on garde les seeds pour debug)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id);
  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
