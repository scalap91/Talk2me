/**
 * Screenshots Lot 4 — Talk2Me Visual QA N12 (Pascal 2026-06-04).
 *
 * 3 preuves visuelles :
 *  - hotel_evry_pass  : "Hôtel Évry" → vraie PlaceCard avec hôtels OSM
 *  - vol_bangkok_no_price : "Combien coûte un vol pour Bangkok" → pas de prix inventé
 *  - check_clarify : "Check" → clarification naturelle, pas de tool wildtrip
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = process.cwd() + '/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const HOST = 'http://127.0.0.1:3010';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';

const db = new Database(DB_PATH);

function createUser(label = 'lot4') {
  const id = randomUUID();
  const username = `${label}_${randomBytes(2).toString('hex')}`;
  const email = `${label}_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'feminin')`,
  ).run(id, talk2meId, username, 'Pascal', email, now, now, 'Léa');
  return { id, username };
}

function createSession(userId) {
  const token = randomUUID();
  const now = Date.now();
  const expires = now + 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, expires);
  return token;
}

async function postChat(token, message) {
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
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
  u.searchParams.set('wait', '3500');
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

  // === Test 1: hotel Évry → PlaceCard avec vrais hôtels ===
  {
    const u = createUser('lot4hotel');
    const token = createSession(u.id);
    console.log(`[T1 hotel_evry_pass] user=${u.username} token=${token.slice(0, 8)}…`);
    const r = await postChat(token, 'Hôtel Évry');
    console.log(
      '  /api/chat:',
      JSON.stringify({
        text: (r.text || '').slice(0, 100),
        places_count: r.places?.length || 0,
        categories: (r.places || []).slice(0, 3).map((p) => p.category),
      }),
    );
    await new Promise((res) => setTimeout(res, 2000));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_lot4_hotel_evry_pass.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  // === Test 2: vol Bangkok → pas de prix inventé ===
  {
    const u = createUser('lot4flight');
    const token = createSession(u.id);
    console.log(
      `[T2 vol_bangkok_no_price] user=${u.username} token=${token.slice(0, 8)}…`,
    );
    const r = await postChat(token, 'Combien coûte un vol pour Bangkok');
    console.log(
      '  /api/chat:',
      JSON.stringify({
        text: (r.text || '').slice(0, 200),
        web_search_count: r.web_search?.results?.length || 0,
      }),
    );
    await new Promise((res) => setTimeout(res, 2000));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_lot4_vol_bangkok_no_price.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  // === Test 3: "Check" → clarification ===
  {
    const u = createUser('lot4check');
    const token = createSession(u.id);
    console.log(`[T3 check_clarify] user=${u.username} token=${token.slice(0, 8)}…`);
    const r = await postChat(token, 'Check');
    console.log(
      '  /api/chat:',
      JSON.stringify({
        text: (r.text || '').slice(0, 200),
        card_kind:
          r.youtube
            ? 'YouTubeCard'
            : r.places?.length
              ? 'PlaceCard'
              : r.web_search
                ? 'SearchResultCard'
                : null,
      }),
    );
    await new Promise((res) => setTimeout(res, 2000));
    await shoot(
      `${HOST}/c/${r.conversationId}`,
      `${OUT_DIR}/talk2me_lot4_check_clarify.png`,
      token,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }

  console.log('done.');
  db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
