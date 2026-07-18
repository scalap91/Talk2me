/**
 * Talk2Me #420 — Test E2E bande son éditeur VideoCard.
 *
 * Scénario :
 *  1. Setup user + session
 *  2. Upload vidéo 10s factice (avec audio sine)
 *  3. GET /api/audio-lib → catégories + counts
 *  4. GET /api/audio-lib?category=chill → tracks
 *  5. POST /api/cards/editor/add-audio (lib chill-1) → preview MP4
 *  6. POST /api/cards/editor/apply-video-ops avec audio → final mix
 *  7. Vérification : final_video_url existe + a une piste audio
 *  8. Sécurité : audio_url invalide rejeté
 *  9. Cleanup
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';

const DB_PATH = process.cwd() + '/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';
const SAMPLE_10S = '/tmp/test_p420_10s.mp4';

const db = new Database(DB_PATH);

function uniqueEmail(prefix) {
  return `${prefix}_p420_${randomBytes(3).toString('hex')}@bizzi.test`;
}

function ensureSample10s() {
  if (existsSync(SAMPLE_10S)) return;
  console.log('[setup] generating 10s sample with audio…');
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=10:size=576x1024:rate=30',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=10',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      SAMPLE_10S,
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
  return { id, talk2me_id: talk2meId, username, display_name: displayName, email };
}

function createSession(userId) {
  const token = randomUUID();
  const now = Date.now();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token, userId, now, expires
  );
  return token;
}

async function apiGet(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: token ? { Cookie: `talk2me_session=${token}` } : {},
    redirect: 'manual',
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

async function apiPost(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `talk2me_session=${token}` },
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

function probeAudioStream(filePath) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath],
    { encoding: 'utf-8' }
  );
  return (r.stdout || '').trim().includes('audio');
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? 'OK ' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  ensureSample10s();

  const u = createUserDirect(
    uniqueEmail('audmix'),
    'AudioMixTest',
    'audmix_' + randomBytes(2).toString('hex')
  );
  const token = createSession(u.id);
  console.log(`User ${u.username} session ok`);

  // 0) Upload sample
  const up = await apiUploadFile(SAMPLE_10S, token);
  const uploadOK = up.status === 200 && typeof up.json?.url === 'string';
  record('0. Upload vidéo 10s', uploadOK, `url=${up.json?.url || 'none'}`);
  if (!uploadOK) { console.error(up.text); process.exit(1); }
  const sourceUrl = up.json.url;

  // 1) GET /api/audio-lib (catalogue index)
  let r = await apiGet('/api/audio-lib');
  const idxOK =
    r.status === 200 &&
    Array.isArray(r.json?.categories) &&
    r.json.categories.length >= 5 &&
    typeof r.json?.total === 'number' &&
    r.json.total >= 25;
  record('1. GET /api/audio-lib (index)', idxOK,
    `cats=${(r.json?.categories || []).join(',')} total=${r.json?.total}`);

  // 2) GET ?category=chill
  r = await apiGet('/api/audio-lib?category=chill');
  const chillOK =
    r.status === 200 &&
    Array.isArray(r.json?.tracks) &&
    r.json.tracks.length >= 5 &&
    r.json.tracks.every((t) => t.category === 'chill' && typeof t.file === 'string');
  record('2. GET chill tracks', chillOK, `n=${r.json?.tracks?.length || 0}`);

  const firstChill = r.json?.tracks?.[0];
  if (!firstChill) { process.exit(1); }

  // 3) Preview audio mix via /api/cards/editor/add-audio (source=lib)
  console.log('[step 3] ffmpeg mix preview — ~5s…');
  r = await apiPost('/api/cards/editor/add-audio', token, {
    video_path: sourceUrl,
    audio_source: 'lib',
    audio_id: firstChill.id,
    video_volume: 70,
    audio_volume: 50,
    audio_offset_sec: 0,
  });
  const previewOK =
    r.status === 200 &&
    r.json?.ok === true &&
    typeof r.json?.preview_url === 'string' &&
    r.json.preview_url.startsWith('/uploads/preview_');
  record('3. add-audio preview (lib)', previewOK,
    previewOK ? `url=${r.json.preview_url}` : `status=${r.status} body=${(r.text || '').slice(0, 200)}`);

  if (previewOK) {
    const previewPath = `${process.cwd()}/public${r.json.preview_url}`;
    const ex = existsSync(previewPath);
    const sz = ex ? (await stat(previewPath)).size : 0;
    const hasAudio = ex ? probeAudioStream(previewPath) : false;
    record('3b. Preview file existe + a piste audio', ex && sz > 1000 && hasAudio,
      `exists=${ex} size=${sz} hasAudio=${hasAudio}`);
  }

  // 4) Apply video ops avec audio mix
  console.log('[step 4] ffmpeg apply-video-ops avec audio — ~5s…');
  r = await apiPost('/api/cards/editor/apply-video-ops', token, {
    source_url: sourceUrl,
    ops: {
      trim: null,
      cover_time_s: 2,
      texts: [],
      audio: {
        audio_url: firstChill.file,
        video_volume: 60,
        audio_volume: 70,
        audio_offset_sec: 0,
      },
    },
  });
  const bakeOK =
    r.status === 200 &&
    r.json?.ok === true &&
    typeof r.json?.final_video_url === 'string' &&
    (r.json.steps || []).some((s) => s.startsWith('audio mix'));
  record('4. apply-video-ops avec audio', bakeOK,
    bakeOK
      ? `steps=${(r.json.steps || []).join('|')}`
      : `status=${r.status} body=${(r.text || '').slice(0, 240)}`);

  if (bakeOK) {
    const finalPath = `${process.cwd()}/public${r.json.final_video_url}`;
    const ex = existsSync(finalPath);
    const sz = ex ? (await stat(finalPath)).size : 0;
    const hasAudio = ex ? probeAudioStream(finalPath) : false;
    record('4b. Final video a piste audio mixée', ex && sz > 1000 && hasAudio,
      `exists=${ex} size=${sz} hasAudio=${hasAudio}`);
  }

  // 5) Sécurité : audio_url invalide rejeté
  r = await apiPost('/api/cards/editor/add-audio', token, {
    video_path: sourceUrl,
    audio_source: 'upload',
    audio_path: '/etc/passwd',
    video_volume: 80,
    audio_volume: 60,
    audio_offset_sec: 0,
  });
  const secOK = r.status === 400;
  record('5. Sécurité audio_url path-traversal rejetée', secOK, `status=${r.status}`);

  // 6) Sécurité : audio_id inexistant
  r = await apiPost('/api/cards/editor/add-audio', token, {
    video_path: sourceUrl,
    audio_source: 'lib',
    audio_id: 'does-not-exist',
    video_volume: 80,
    audio_volume: 60,
    audio_offset_sec: 0,
  });
  const sec2OK = r.status === 404;
  record('6. Sécurité audio_id inconnu rejeté', sec2OK, `status=${r.status}`);

  // 7) Page /credits/audio servie publique
  r = await fetch(`${BASE}/credits/audio`, { redirect: 'manual' });
  const creditsOK = r.status === 200;
  record('7. /credits/audio public', creditsOK, `status=${r.status}`);

  // Cleanup session
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
