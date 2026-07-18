// Talk2Me — seed compte "T2M Officiel" + 17 posts (1 par embed)
// Pascal 2026-06-05 — usage : node scripts/seed-t2m-officiel.mjs
//
// Pas de modif code source. Seed DB pur + curl POST /api/posts pour reproduire
// pipeline normal (validation max slides, etc.). Compte system isolé.

import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const DB_PATH = process.cwd() + '/data/talktome.db';
const API_BASE = 'http://localhost:3010';

const PLATFORMS = [
  { key: 'youtube',     url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { key: 'tiktok',      url: 'https://www.tiktok.com/@khaby.lame/video/7297567693543968033' },
  { key: 'spotify',     url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp' },
  { key: 'maps',        url: 'https://www.google.com/maps/place/Tour+Eiffel' },
  { key: 'twitter',     url: 'https://x.com/Twitter/status/1445078208190291973' },
  { key: 'facebook',    url: 'https://www.facebook.com/MetaForBusiness/posts/789327796516797' },
  { key: 'instagram',   url: 'https://www.instagram.com/p/CkkBXVKgUR_/' },
  { key: 'soundcloud',  url: 'https://soundcloud.com/forss/flickermood' },
  { key: 'vimeo',       url: 'https://vimeo.com/76979871' },
  { key: 'reddit',      url: 'https://www.reddit.com/r/aww/comments/8e1zb8/she_loves_my_chest/' },
  { key: 'twitch',      url: 'https://www.twitch.tv/shroud' },
  { key: 'dailymotion', url: 'https://www.dailymotion.com/video/x84sh87' },
  { key: 'linkedin',    url: 'https://www.linkedin.com/posts/satyanadella_microsoft-build-2024-activity-7196830730050486272-h8h0' },
  { key: 'pinterest',   url: 'https://www.pinterest.com/pin/99360735500167749/' },
  { key: 'loom',        url: 'https://www.loom.com/share/3a8fbc1c1d834c54bf3aafdf30e9d22a' },
  { key: 'applemusic',  url: 'https://music.apple.com/fr/album/random-access-memories/617154241' },
  { key: 'deezer',      url: 'https://www.deezer.com/fr/album/6575789' },
];

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---------- 1. User "T2M Officiel" ----------
let existing = db
  .prepare("SELECT * FROM users WHERE username = 't2m' OR email = 'officiel@talk2me.fr'")
  .get();

let userId, talk2meId;
if (existing) {
  userId = existing.id;
  talk2meId = existing.talk2me_id;
  console.log('[user] déjà existant :', userId, 'talk2me_id', talk2meId);
} else {
  userId = crypto.randomUUID();
  // Génère talk2me_id 6 chiffres unique (logique calquée db.ts)
  const checkId = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ? LIMIT 1');
  for (let i = 0; i < 50; i++) {
    const n = 100000 + Math.floor(Math.random() * 900000);
    if (!checkId.get(String(n))) { talk2meId = String(n); break; }
  }
  if (!talk2meId) throw new Error('cannot gen talk2me_id');
  const now = Date.now();
  db.prepare(`
    INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email,
                       created_at, last_seen, ai_name, ai_avatar_url, ai_gender, avatar_url)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, NULL)
  `).run(
    userId,
    talk2meId,
    't2m',
    'T2M Officiel',
    'officiel@talk2me.fr',
    now,
    now,
    'Léa',
    'feminin'
  );
  console.log('[user] créé :', userId, 'talk2me_id', talk2meId);
}

// ---------- 2. Conversation agent ----------
let conv = db
  .prepare(`SELECT id FROM conversations WHERE user_id = ? AND (kind IS NULL OR kind = 'agent') ORDER BY created_at DESC LIMIT 1`)
  .get(userId);

let convId;
if (conv) {
  convId = conv.id;
  console.log('[conv] déjà existante :', convId);
} else {
  convId = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
  ).run(convId, userId, now, userId);
  db.prepare(
    'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).run(convId, userId, now);
  console.log('[conv] créée :', convId);
}

// ---------- 3. Session token (debug Pascal) ----------
const sessionToken = crypto.randomBytes(32).toString('hex');
const nowSess = Date.now();
db.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
).run(sessionToken, userId, nowSess, nowSess + 30 * 24 * 60 * 60 * 1000);
console.log('[session] token créé :', sessionToken.slice(0, 12) + '…');

// ---------- 4. Pour chaque plateforme : message URL + POST /api/posts ----------
const cookieHeader = `talk2me_session=${sessionToken}`;

const results = [];
for (let i = 0; i < PLATFORMS.length; i++) {
  const p = PLATFORMS[i];
  // espacement temporel léger pour ordre stable
  const ts = Date.now() + i;
  const messageId = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, text, links, created_at,
                            kind, sender_id)
      VALUES (?, ?, 'user', ?, '[]', ?, 'user', ?)
    `).run(messageId, convId, p.url, ts, userId);
  } catch (e) {
    results.push({ ...p, messageId, postId: null, ok: false, err: 'insert_message: ' + e.message });
    continue;
  }

  // POST /api/posts pour passer par la logique normale createPost + validation
  try {
    const res = await fetch(`${API_BASE}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ messageIds: [messageId] }),
    });
    const body = await res.text();
    if (!res.ok) {
      results.push({ ...p, messageId, postId: null, ok: false, err: `HTTP ${res.status}: ${body.slice(0, 200)}` });
      continue;
    }
    const json = JSON.parse(body);
    results.push({ ...p, messageId, postId: json.id, ok: true });
    console.log(`[post] ${p.key.padEnd(12)} → ${json.id}`);
  } catch (e) {
    results.push({ ...p, messageId, postId: null, ok: false, err: 'fetch: ' + e.message });
  }
}

db.close();

// ---------- 5. Rapport ----------
const ok = results.filter(r => r.ok).length;
const ko = results.length - ok;

const reportLines = [
  '# T2M Officiel — Seed embeds 2026-06-05',
  '',
  '## Compte créé',
  `- userId : \`${userId}\``,
  `- talk2me_id : \`${talk2meId}\``,
  `- username : @t2m`,
  `- display_name : T2M Officiel`,
  `- email : officiel@talk2me.fr`,
  `- convId agent : \`${convId}\``,
  `- sessionToken (dev) : \`${sessionToken}\``,
  '',
  '## Posts publiés',
  '',
  '| # | Plateforme | URL | post_id | OK |',
  '|---|---|---|---|---|',
  ...results.map((r, i) =>
    `| ${i + 1} | ${r.key} | ${r.url} | ${r.postId ? '`' + r.postId + '`' : '—'} | ${r.ok ? 'OK' : 'KO (' + (r.err || '?') + ')'} |`
  ),
  '',
  '## Stats',
  `- Posts créés : ${ok}/${results.length}`,
  `- Échecs : ${ko}`,
  '',
  '## Doctrine',
  '- Compte system isolé (séparé de Pascal réel) : OUI',
  '- Aucun appel IA : OUI',
  '- 0 modif code source : OUI',
  '- Pas de touch tests/fuzz : OUI',
  '',
];

const fs = await import('node:fs/promises');
await fs.writeFile('/home/ubuntu/dashboard/uploads/t2m_officiel_seed_report.md', reportLines.join('\n'));
console.log('\n=== RAPPORT ===');
console.log(`OK: ${ok}/${results.length}`);
console.log('Rapport: /home/ubuntu/dashboard/uploads/t2m_officiel_seed_report.md');

if (ko > 0) {
  console.log('\nÉchecs :');
  for (const r of results.filter(x => !x.ok)) {
    console.log(`  - ${r.key}: ${r.err}`);
  }
}

// Sortie machine-readable pour le script wrapper
console.log('\n=== JSON ===');
console.log(JSON.stringify({ userId, talk2meId, convId, sessionToken, results }, null, 2));
