/**
 * Talk2Me #329 — Test E2E API VideoCard editor IA (Phase B).
 *
 * Scénario :
 *  1. Crée user "VideoEditor Test" + session
 *  2. Upload vidéo 30s factice via /api/upload
 *  3. POST /api/cards/editor/chat avec draft vidéo + "coupe entre 5 et 15 secondes"
 *     → ops doit contenir edit_video_trim {start_s: 5, end_s: 15}
 *  4. POST chat "utilise la frame à 8s comme cover"
 *     → ops contient edit_video_cover {time_s: 8}
 *  5. POST chat "ajoute texte BONJOUR en haut"
 *     → ops contient edit_video_add_text {content: BONJOUR, position: top}
 *  6. POST chat hors-sujet "c'est quoi la météo" → IA recentre
 *  7. POST /api/cards/editor/apply-video-ops avec trim+text+cover
 *     → reçoit final_video_url + cover_url
 *  8. POST /api/cards/create avec final_video_url → card publiée
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';
const UPLOAD_DIR = '/home/ubuntu/talktome/public/uploads';
const SAMPLE_30S = '/tmp/test_30s.mp4';

const db = new Database(DB_PATH);

function uniqueEmail(prefix) {
  return `${prefix}_p329_${randomBytes(3).toString('hex')}@bizzi.test`;
}

function ensureSample30s() {
  if (existsSync(SAMPLE_30S)) return;
  console.log('[setup] generating 30s sample…');
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=30:size=576x1024:rate=30',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      SAMPLE_30S,
    ],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) throw new Error('ffmpeg sample gen failed');
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

async function apiPost(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

async function apiUploadFile(path, token) {
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  const fd = new FormData();
  // Note: undici File requires a Blob; use raw bytes via Blob.
  const blob = new Blob([buf], { type: 'video/mp4' });
  fd.append('file', blob, 'sample.mp4');
  const r = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Cookie: `talk2me_session=${token}` },
    body: fd,
    redirect: 'manual',
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? 'OK ' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  ensureSample30s();

  const u = createUserDirect(
    uniqueEmail('videdit'),
    'VideoEditorTest',
    'videdit_' + randomBytes(2).toString('hex')
  );
  const token = createSession(u.id);
  console.log(`User ${u.username} session ok`);

  // 0) Upload du sample
  const up = await apiUploadFile(SAMPLE_30S, token);
  const uploadOK = up.status === 200 && typeof up.json?.url === 'string' && up.json.url.startsWith('/uploads/');
  record('0. Upload vidéo 30s', uploadOK, `url=${up.json?.url || 'none'}`);
  if (!uploadOK) {
    console.error('Upload failed, abort');
    console.error(up.text);
    process.exit(1);
  }
  const sourceUrl = up.json.url;

  // Draft snapshot vidéo de référence
  const baseDraft = {
    type: 'video',
    crop: 'original',
    filter: 'none',
    texts: [],
    title: '',
    description: '',
    hashtags: [],
    duration_s: 30,
    trim: null,
    cover_time_s: null,
  };

  // 1) IA : "coupe entre 5 et 15 secondes"
  let r = await apiPost('/api/cards/editor/chat', token, {
    message: 'coupe la vidéo entre 5 et 15 secondes',
    draft: baseDraft,
    history: [],
  });
  const trimOp = (r.json?.ops || []).find((o) => o.tool === 'edit_video_trim');
  const trimOK =
    r.status === 200 &&
    !!trimOp &&
    Math.round(trimOp.args.start_s) === 5 &&
    Math.round(trimOp.args.end_s) === 15;
  record('1. IA trim 5→15s', trimOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 2) IA : cover @ 8s
  r = await apiPost('/api/cards/editor/chat', token, {
    message: 'utilise la frame à 8 secondes comme couverture',
    draft: { ...baseDraft, trim: { start_s: 5, end_s: 15 } },
    history: [],
  });
  const coverOp = (r.json?.ops || []).find((o) => o.tool === 'edit_video_cover');
  const coverOK =
    r.status === 200 && !!coverOp && Math.round(coverOp.args.time_s) === 8;
  record('2. IA cover @8s', coverOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 3) IA : ajoute texte BONJOUR en haut
  r = await apiPost('/api/cards/editor/chat', token, {
    message: 'ajoute le texte BONJOUR en haut de la vidéo',
    draft: { ...baseDraft, trim: { start_s: 5, end_s: 15 } },
    history: [],
  });
  const textOp = (r.json?.ops || []).find((o) => o.tool === 'edit_video_add_text');
  const textOK =
    r.status === 200 &&
    !!textOp &&
    typeof textOp.args.content === 'string' &&
    textOp.args.content.toUpperCase().includes('BONJOUR') &&
    textOp.args.position === 'top';
  record('3. IA add_text BONJOUR top', textOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 4) Hors-sujet météo
  r = await apiPost('/api/cards/editor/chat', token, {
    message: "c'est quoi la météo à Paris ?",
    draft: baseDraft,
    history: [],
  });
  const txt = (r.json?.text || '').toLowerCase();
  const noWeatherOps = !(r.json?.ops || []).some((o) =>
    ['get_weather', 'search_web', 'search_place'].includes(o.tool)
  );
  const reframed =
    r.status === 200 &&
    noWeatherOps &&
    txt.length > 0 &&
    (txt.includes('card') ||
      txt.includes('édit') ||
      txt.includes('concentr') ||
      txt.includes('sujet') ||
      txt.includes('vidéo') ||
      txt.includes('video') ||
      txt.includes('publi'));
  record('4. IA recentre (hors-sujet météo)', reframed, `text="${(r.json?.text || '').slice(0, 140)}"`);

  // 5) IA : clear trim
  r = await apiPost('/api/cards/editor/chat', token, {
    message: 'annule le trim, je veux la vidéo complète',
    draft: { ...baseDraft, trim: { start_s: 5, end_s: 15 } },
    history: [],
  });
  const clearOp = (r.json?.ops || []).find((o) => o.tool === 'edit_video_clear_trim');
  const clearOK = r.status === 200 && !!clearOp;
  record('5. IA clear_trim', clearOK, `ops=${JSON.stringify(r.json?.ops || []).slice(0, 200)}`);

  // 6) Apply video ops (ffmpeg baking)
  console.log('[step 6] ffmpeg baking — peut prendre 10s…');
  r = await apiPost('/api/cards/editor/apply-video-ops', token, {
    source_url: sourceUrl,
    ops: {
      trim: { start_s: 5, end_s: 15 },
      cover_time_s: 3, // 3s post-trim = 8s source
      texts: [
        { content: 'BONJOUR', position: 'top', start_s: null, end_s: null },
      ],
    },
  });
  const bakeOK =
    r.status === 200 &&
    r.json?.ok === true &&
    typeof r.json?.final_video_url === 'string' &&
    r.json.final_video_url.startsWith('/uploads/') &&
    typeof r.json?.cover_url === 'string' &&
    r.json.cover_url.startsWith('/uploads/') &&
    typeof r.json?.duration_s === 'number' &&
    r.json.duration_s > 9 && r.json.duration_s < 11;
  record('6. apply-video-ops baking', bakeOK,
    bakeOK
      ? `dur=${r.json.duration_s.toFixed(2)}s steps=${(r.json.steps || []).join('|')}`
      : `status=${r.status} body=${(r.text || '').slice(0, 240)}`
  );

  let finalVideoUrl = null;
  let coverUrl = null;
  if (bakeOK) {
    finalVideoUrl = r.json.final_video_url;
    coverUrl = r.json.cover_url;
    // Vérifie l'existence physique
    const vp = `/home/ubuntu/talktome/public${finalVideoUrl}`;
    const cp = `/home/ubuntu/talktome/public${coverUrl}`;
    const vExists = existsSync(vp);
    const cExists = existsSync(cp);
    const vSize = vExists ? (await stat(vp)).size : 0;
    const cSize = cExists ? (await stat(cp)).size : 0;
    record('6b. Fichiers produits existent', vExists && cExists && vSize > 1000 && cSize > 1000,
      `video=${vSize}B cover=${cSize}B`);
  }

  // 7) Publication via /api/cards/create
  if (finalVideoUrl) {
    r = await apiPost('/api/cards/create', token, {
      type: 'video',
      media_url: finalVideoUrl,
      caption: 'Test vidéo coupée\nVibes 10 secondes\n#test #video #bonjour',
    });
    const publishOK = r.status === 200 && r.json?.card && r.json.card.type === 'video';
    record('7. Publication VideoCard', publishOK, `card_id=${r.json?.card?.id || 'none'}`);
  } else {
    record('7. Publication VideoCard', false, 'skipped (no final video)');
  }

  // 8) Test sécurité : source_url invalide
  r = await apiPost('/api/cards/editor/apply-video-ops', token, {
    source_url: '/etc/passwd',
    ops: {},
  });
  const secOK = r.status === 400;
  record('8. Sécurité path-traversal rejetée', secOK, `status=${r.status}`);

  // Cleanup session (garde user pour preuve)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n=== RESULT: ${okCount}/${results.length} OK ===`);
  if (okCount < results.length) {
    console.log('FAILS:', results.filter((r) => !r.ok).map((r) => `${r.name} (${r.detail})`).join('\n  '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
