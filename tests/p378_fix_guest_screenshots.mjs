/**
 * Talk2Me #378 — Fix "Guest" hardcodé dans le header des cards /home
 *
 * Stratégie : on utilise puppeteer-service:8004 (qui fonctionne correctement)
 * et on pousse Pascal en TÊTE du feed temporairement en bumpant son created_at
 * dans une copie de la requête API. Plus simple : on PUBLIE 1 nouveau post
 * "Pascal" qui apparaît automatiquement en tête.
 *
 * En fait, la plus simple approche : on prend le screenshot du card T2M
 * (premier item), puis on injecte un seed "Pascal" frais dont le
 * created_at > T2M, donc il apparaît en tête au prochain refresh.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const DB_PATH = process.cwd() + '/data/talktome.db';
const HOST = 'http://127.0.0.1:3010';
const PUPPET = 'http://127.0.0.1:8004/render';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';

const db = new Database(DB_PATH);

// Sessions
const t2mSession = db
  .prepare(
    'SELECT token FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1'
  )
  .get('8f508701-fbdb-460f-bd95-e826873f79e1', Date.now());

if (!t2mSession) throw new Error('No T2M session');

async function shoot(token, outPath, wait = 4500) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', `${HOST}/home`);
  u.searchParams.set('width', '390');
  u.searchParams.set('height', '844');
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', String(wait));
  u.searchParams.set('cookieName', 'talk2me_session');
  u.searchParams.set('cookieValue', token);
  u.searchParams.set('cookieDomain', '127.0.0.1');
  const r = await fetch(u);
  if (!r.ok) throw new Error(`puppeteer ${r.status} ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const fs = await import('node:fs/promises');
  await fs.writeFile(outPath, buf);
  console.log(`  → ${outPath} (${(buf.length / 1024).toFixed(0)}kB)`);
}

(async () => {
  console.log('\n=== Talk2Me #378 — Fix Guest header screenshots ===\n');

  // 1) Screenshot état actuel : T2M Officiel en tête du feed.
  console.log('1) Screenshot T2M Officiel (premier item)…');
  await shoot(t2mSession.token, `${OUT_DIR}/talk2me_fix_guest_t2m_official.png`);

  // 2) Pour le screenshot Pascal : on crée un post de l'user Pascal (red_6b01)
  //    avec un timestamp ultra-récent → il passe en tête du feed.
  const pascalUserId = 'e3d94d76-8fd0-452d-a1eb-4993313e00a5';
  // On crée un message bidon (texte simple) puis un post qui le référence.
  let convRow = db
    .prepare('SELECT id FROM conversations WHERE user_id = ? LIMIT 1')
    .get(pascalUserId);
  if (!convRow) {
    const newConvId = randomUUID();
    db.prepare(
      "INSERT INTO conversations (id, user_id, created_at, kind) VALUES (?, ?, ?, 'agent')"
    ).run(newConvId, pascalUserId, Date.now());
    convRow = { id: newConvId };
  }
  const convId = convRow.id;

  const msgId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, text, links, created_at)
     VALUES (?, ?, 'user', ?, '[]', ?)`
  ).run(msgId, convId, 'Test card Pascal #378 fix Guest header', now);

  const postId = randomUUID();
  db.prepare(
    'INSERT INTO posts (id, user_id, conversation_id, message_ids, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(postId, pascalUserId, convId, JSON.stringify([msgId]), now);
  console.log(`Pascal post seedé: ${postId} (created_at=${now})`);

  // Refresh feed → Pascal en tête.
  console.log('2) Screenshot Pascal (premier item après seed)…');
  await shoot(t2mSession.token, `${OUT_DIR}/talk2me_fix_guest_pascal.png`);

  // Cleanup : on supprime le post seedé pour pas polluer le feed.
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  db.prepare('DELETE FROM messages WHERE id = ?').run(msgId);
  console.log('Cleanup OK');

  console.log('\nDONE');
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
