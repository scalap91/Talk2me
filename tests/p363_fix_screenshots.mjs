/**
 * Talk2Me #363 — Screenshots fixes Bugs A/B/C (Pascal 2026-06-05).
 *
 * Bug A : silence IA sur lien collé (URL seule ou + verbe partage)
 * Bug B : pas de cards YouTube hallucinées sur conv non-vidéo
 * Bug C : message-lien publié sur /home
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';

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
  const username = 'p363_' + randomBytes(2).toString('hex');
  const email = `p363_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  const talk2meId = makeTalk2MeId();
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, displayName, email, now, now, `Léa de ${displayName}`);
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

async function chat(token, message) {
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`chat ${r.status} ${await r.text()}`);
  return r.json();
}

async function publish(token, messageIds) {
  const r = await fetch(`${HOST}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify({ messageIds }),
  });
  if (!r.ok) throw new Error(`post ${r.status} ${await r.text()}`);
  return r.json();
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
  if (!r.ok) throw new Error(`puppeteer ${r.status} ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const fs = await import('node:fs/promises');
  await fs.writeFile(out, buf);
  console.log(`  → ${out} (${(buf.length / 1024).toFixed(0)}kB)`);
}

(async () => {
  console.log('\n=== Talk2Me #363 — Fix Bugs A/B/C screenshots ===\n');
  const user = createUser('Pascal');
  const token = createSession(user.id);
  global.__TOKEN__ = token;
  console.log(`User: ${user.username} (id=${user.id})`);
  console.log(`Token: ${token}\n`);

  // === Bug A : URL seule → silence ===
  console.log('Bug A — POST URL seule...');
  const aRes = await chat(token, 'https://onyx-infos.fr/articles/chine-bug-fix-test');
  console.log('  ai_reply_skipped =', aRes.ai_reply_skipped, '|', 'text=', JSON.stringify(aRes.text));
  if (aRes.ai_reply_skipped !== 'url_only') {
    console.error('  ✗ FAIL : IA a répondu au lieu de garder silence');
  } else {
    console.log('  ✓ OK : IA silencieuse');
  }

  console.log('Bug A — POST "tiens https://..."');
  const aRes2 = await chat(token, 'tiens https://onyx-infos.fr/articles/x');
  console.log('  ai_reply_skipped =', aRes2.ai_reply_skipped);
  if (aRes2.ai_reply_skipped !== 'url_only') {
    console.error('  ✗ FAIL : "tiens" + URL aurait dû déclencher silence');
  } else {
    console.log('  ✓ OK : "tiens" silencieux');
  }

  // === Bug C : publier message-lien ===
  console.log('\nBug C — Publier message lien seul...');
  const post = await publish(token, [aRes.userMessageId]);
  console.log('  postId =', post.id);
  console.log('  ✓ OK : post créé');

  // Screenshot conv après URL silence
  console.log('\n[shoot] talk2me_fix_link_silent.png (conv après URL silence)');
  await shoot(`${HOST}/`, `${OUT_DIR}/talk2me_fix_link_silent.png`, { wait: 3500 });

  // Screenshot home (post lien)
  console.log('[shoot] talk2me_fix_publish_link.png (post sur /home)');
  await shoot(`${HOST}/home`, `${OUT_DIR}/talk2me_fix_publish_link.png`, { wait: 3500 });

  // Screenshot conv pour montrer ABSENCE cards YouTube génériques
  console.log('[shoot] talk2me_fix_no_yt_hallucin.png (conv complète)');
  await shoot(`${HOST}/`, `${OUT_DIR}/talk2me_fix_no_yt_hallucin.png`, {
    wait: 3500,
    h: 1500, // viewport tall pour capturer tout
  });

  console.log('\n=== DONE ===\n');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
