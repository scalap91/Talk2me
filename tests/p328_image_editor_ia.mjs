/**
 * Talk2Me #328 — Test E2E API ImageCard editor IA.
 *
 * Scénario :
 *  1. Crée user "Editor Test" + session
 *  2. Ajoute memory style ("style direct, jeune")
 *  3. POST /api/cards/editor/chat avec draft vide + "recadre en vertical"
 *     → ops doit contenir edit_image_crop vertical
 *  4. Re-call avec "ajoute un texte Soirée Paris en haut"
 *     → ops contient edit_image_add_text
 *  5. Re-call "génère 5 hashtags"
 *     → ops contient set_hashtags avec >=3 tags
 *  6. Re-call HORS-SUJET "c'est quoi la météo à Paris"
 *     → IA recentre (texte pas vide, ops vide ou pas)
 *  7. POST /api/cards/editor/generate-metadata field=title
 *     → value string non-vide
 *  8. POST /api/cards/editor/generate-metadata field=description
 *  9. POST /api/cards/editor/generate-metadata field=hashtags count=6
 * 10. POST /api/upload + /api/cards/create avec caption → card publiée
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';
const db = new Database(DB_PATH);

function uniqueEmail(prefix) {
  return `${prefix}_p328_${randomBytes(3).toString('hex')}@bizzi.test`;
}

function createUserDirect(email, displayName, username) {
  const now = Date.now();
  const id = randomUUID();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  const defaultAi = `T2M de ${displayName}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, displayName, email, now, now, defaultAi);
  const convId = randomUUID();
  db.prepare(
    `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'agent', ?)`
  ).run(convId, id, now, id);
  db.prepare(
    `INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`
  ).run(convId, id, now);
  return { id, talk2me_id: talk2meId, username, display_name: displayName, email };
}

function createSession(userId) {
  const token = randomUUID();
  const now = Date.now();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    expires
  );
  return token;
}

function addMemory(userId, content) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ai_memories (id, user_id, kind, content, weight, source_conv_id, source_message_id, created_at, last_used_at)
     VALUES (?, ?, 'style', ?, 1.0, NULL, NULL, ?, NULL)`
  ).run(id, userId, content, Date.now());
}

async function apiPost(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? 'OK ' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const u = createUserDirect(uniqueEmail('editor'), 'EditorTest', 'editortest_' + randomBytes(2).toString('hex'));
  const token = createSession(u.id);
  console.log(`User ${u.username} session ok`);

  addMemory(u.id, 'style direct et jeune');

  // 1) crop vertical
  let r = await apiPost('/api/cards/editor/chat', token, {
    message: 'recadre en vertical',
    draft: {
      type: 'image',
      crop: 'original',
      filter: 'none',
      texts: [],
      title: '',
      description: '',
      hashtags: [],
    },
    history: [],
  });
  const cropOK =
    r.status === 200 &&
    Array.isArray(r.json?.ops) &&
    r.json.ops.some(
      (o) => o.tool === 'edit_image_crop' && o.args?.ratio === 'vertical'
    );
  record('1. IA crop vertical', cropOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 2) ajoute texte en haut
  r = await apiPost('/api/cards/editor/chat', token, {
    message: "ajoute un texte 'Soirée Paris' en haut",
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'none',
      texts: [],
      title: '',
      description: '',
      hashtags: [],
    },
    history: [],
  });
  const textOK =
    r.status === 200 &&
    Array.isArray(r.json?.ops) &&
    r.json.ops.some(
      (o) =>
        o.tool === 'edit_image_add_text' &&
        typeof o.args?.content === 'string' &&
        o.args.content.toLowerCase().includes('soirée') ||
        o.args?.content?.toLowerCase().includes('soiree') ||
        o.args?.content?.toLowerCase().includes('paris')
    );
  record('2. IA add_text "Soirée Paris"', textOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 3) hashtags
  r = await apiPost('/api/cards/editor/chat', token, {
    message: 'génère 5 hashtags',
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'none',
      texts: [{ id: 't1', content: 'Soirée Paris', position: 'top' }],
      title: '',
      description: '',
      hashtags: [],
    },
    history: [],
  });
  const tagsOp = (r.json?.ops || []).find((o) => o.tool === 'set_hashtags');
  const tagsOK =
    r.status === 200 &&
    tagsOp &&
    Array.isArray(tagsOp.result) &&
    tagsOp.result.length >= 3;
  record('3. IA génère hashtags', tagsOK, `count=${tagsOp?.result?.length || 0} tags=${JSON.stringify(tagsOp?.result || []).slice(0, 200)}`);

  // 4) Hors-sujet
  r = await apiPost('/api/cards/editor/chat', token, {
    message: "c'est quoi la météo à Paris ?",
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'none',
      texts: [],
      title: '',
      description: '',
      hashtags: [],
    },
    history: [],
  });
  const text = (r.json?.text || '').toLowerCase();
  const noWeatherOps = !(r.json?.ops || []).some((o) =>
    ['get_weather', 'search_web', 'search_place'].includes(o.tool)
  );
  const reframed =
    r.status === 200 &&
    noWeatherOps &&
    text.length > 0 &&
    (text.includes('card') ||
      text.includes('édit') ||
      text.includes('concentr') ||
      text.includes('sujet') ||
      text.includes('image') ||
      text.includes('publi'));
  record('4. IA recentre sur la card (hors-sujet météo)', reframed, `text="${(r.json?.text || '').slice(0, 140)}"`);

  // 5) Generate title manuel
  r = await apiPost('/api/cards/editor/generate-metadata', token, {
    field: 'title',
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'auto',
      texts: [{ content: 'Soirée Paris', position: 'top' }],
      title: '',
      description: '',
      hashtags: [],
    },
  });
  const titleOK = r.status === 200 && typeof r.json?.value === 'string' && r.json.value.length > 0;
  record('5. Génération titre manuelle', titleOK, `value="${(r.json?.value || '').slice(0, 140)}"`);

  // 6) Generate description
  r = await apiPost('/api/cards/editor/generate-metadata', token, {
    field: 'description',
    length: 'short',
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'auto',
      texts: [{ content: 'Soirée Paris', position: 'top' }],
      title: 'Une nuit à Paris',
      description: '',
      hashtags: [],
    },
  });
  const descOK = r.status === 200 && typeof r.json?.value === 'string' && r.json.value.length > 0;
  record('6. Génération description manuelle', descOK, `value="${(r.json?.value || '').slice(0, 140)}"`);

  // 7) Generate hashtags (count=6)
  r = await apiPost('/api/cards/editor/generate-metadata', token, {
    field: 'hashtags',
    count: 6,
    draft: {
      type: 'image',
      crop: 'vertical',
      filter: 'auto',
      texts: [{ content: 'Soirée Paris', position: 'top' }],
      title: 'Une nuit à Paris',
      description: 'Vibes du samedi.',
      hashtags: [],
    },
  });
  const hashOK = r.status === 200 && Array.isArray(r.json?.value) && r.json.value.length >= 3;
  record('7. Génération hashtags manuelle (count=6)', hashOK, `tags=${JSON.stringify(r.json?.value || []).slice(0, 200)}`);

  // 8) Publish une fake card (sans vraie image — on simule un upload existant)
  // On crée un fichier image factice dans /public/uploads via touch et on call /api/cards/create
  // pour valider que la publication marche end-to-end.
  // -- On évite le pipeline upload réel ici : on simule un media_url valide.
  // -- Note : /api/cards/create exige media_url commençant par /uploads/. On
  //    écrit un PNG 1×1 minimal pour qu'il existe (au cas où la page le
  //    fetch ensuite).
  const fakeFile = `/home/ubuntu/talktome/public/uploads/p328_test_${randomBytes(3).toString('hex')}.png`;
  const PNG_1x1 = Buffer.from(
    '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489000000017352474200AECE1CE90000000D49444154789C636060606000000005000150C9F2530000000049454E44AE426082',
    'hex'
  );
  const { writeFile } = await import('node:fs/promises');
  await writeFile(fakeFile, PNG_1x1);
  const mediaUrl = '/uploads/' + fakeFile.split('/').pop();

  r = await apiPost('/api/cards/create', token, {
    type: 'image',
    media_url: mediaUrl,
    caption: 'Une nuit à Paris\nVibes du samedi.\n#paris #soiree #nuit',
  });
  const publishOK = r.status === 200 && r.json?.card && r.json.card.type === 'image';
  record('8. Publication ImageCard via /api/cards/create', publishOK, `card_id=${r.json?.card?.id || 'none'}`);

  // Cleanup
  db.prepare('DELETE FROM ai_memories WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  // Garde le user + la card pour preuve

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n=== RESULT: ${okCount}/${results.length} OK ===`);
  if (okCount < results.length) {
    console.log('FAILS:', results.filter((r) => !r.ok).map((r) => r.name).join(', '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
