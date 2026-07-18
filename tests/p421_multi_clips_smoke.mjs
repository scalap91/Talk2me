/**
 * Talk2Me #421 — Smoke test pipeline multi-clips ffmpeg.
 *
 * Scénario :
 *  1. Génère 2 mini-vidéos test (rouge 2s + bleu 2s, 720x1280, h264+aac)
 *     directement dans /home/ubuntu/talktome/public/uploads/.
 *  2. Setup user/session.
 *  3. POST /api/cards/editor/apply-video-ops avec clips[] de 2 clips + cut.
 *  4. Vérifie final_video_url existe, durée ≈ 4s, taille > 0.
 *  5. Re-POST avec clips[] + transition fade 300ms.
 *  6. Vérifie final_video_url + durée légèrement < 4s (xfade overlap).
 *  7. Cleanup.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { stat } from 'node:fs/promises';

const DB_PATH = process.cwd() + '/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';
const UPLOAD_DIR = process.cwd() + '/public/uploads';

const db = new Database(DB_PATH);

function uniqueEmail() {
  return `p421_${randomBytes(3).toString('hex')}@bizzi.test`;
}

function genColorClip(outPath, color, durSec) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=720x1280:r=30`,
      '-f', 'lavfi',
      '-i', `sine=frequency=440:sample_rate=48000`,
      '-t', String(durSec),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      outPath,
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg gen ${color} failed: ${r.stderr}`);
  }
}

function probeDuration(file) {
  const r = spawnSync('ffmpeg', ['-i', file], { encoding: 'utf8' });
  const m = r.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error('no duration');
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
}

async function setupUser() {
  const email = uniqueEmail();
  const userId = randomUUID();
  const username = `u${randomBytes(3).toString('hex')}`;
  const now = Date.now();
  // talk2me_id = chiffres 6 digits
  const t2mid = String(Math.floor(100000 + Math.random() * 899999));
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, email, ai_name, ai_gender, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, 'Léa', 'female', ?, ?)`
  ).run(userId, t2mid, username, username, email, now, now);
  const sid = randomBytes(16).toString('hex');
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(sid, userId, now, now + 24 * 3600 * 1000);
  return { userId, email, sid };
}

async function apiPost(path, body, sid) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `talk2me_session=${sid}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

let createdFiles = [];

async function run() {
  console.log('### Talk2Me #421 multi-clips smoke test ###');
  // 1) generate 2 test clips
  const clipA = `/uploads/_test_p421_a_${randomUUID()}.mp4`;
  const clipB = `/uploads/_test_p421_b_${randomUUID()}.mp4`;
  const pathA = `${UPLOAD_DIR}/${clipA.replace('/uploads/', '')}`;
  const pathB = `${UPLOAD_DIR}/${clipB.replace('/uploads/', '')}`;
  console.log('[1] generating test clips…');
  genColorClip(pathA, 'red', 2);
  genColorClip(pathB, 'blue', 2);
  createdFiles.push(pathA, pathB);
  const dA = probeDuration(pathA);
  const dB = probeDuration(pathB);
  console.log(`    A (red) = ${dA.toFixed(2)}s, B (blue) = ${dB.toFixed(2)}s`);

  // 2) setup user
  const { sid } = await setupUser();
  console.log('[2] user session ok');

  // 3) cut concat
  console.log('[3] POST apply-video-ops with cut concat (2 clips)…');
  let r = await apiPost(
    '/api/cards/editor/apply-video-ops',
    {
      source_url: clipA,
      ops: {
        clips: [
          { source_url: clipA, trim_start_sec: 0, trim_end_sec: dA, duration_original_sec: dA, filter: null },
          { source_url: clipB, trim_start_sec: 0, trim_end_sec: dB, duration_original_sec: dB, filter: null },
        ],
        transitions: [{ type: 'cut', duration_ms: 0 }],
        cover_time_s: 0.5,
      },
    },
    sid
  );
  if (r.status !== 200 || !r.json?.ok) {
    console.error('FAILED cut concat:', r.status, JSON.stringify(r.json).slice(0, 500));
    return false;
  }
  console.log(`    final=${r.json.final_video_url} duration=${r.json.duration_s?.toFixed?.(2) || r.json.duration_s}s`);
  console.log('    steps:', r.json.steps?.join(' | '));
  const finalPathCut = `${UPLOAD_DIR}/${r.json.final_video_url.split('/').pop()}`;
  const coverPathCut = `${UPLOAD_DIR}/${r.json.cover_url.split('/').pop()}`;
  createdFiles.push(finalPathCut, coverPathCut);
  if (!existsSync(finalPathCut)) {
    console.error('  final file missing');
    return false;
  }
  const cutDur = probeDuration(finalPathCut);
  console.log(`    measured final duration = ${cutDur.toFixed(2)}s (expected ~4s)`);
  if (cutDur < 3.5 || cutDur > 4.5) {
    console.error('  duration out of range for cut concat');
    return false;
  }

  // 4) fade concat with per-clip filter
  console.log('[4] POST apply-video-ops with fade concat 300ms + filter vintage on A + cinema on B…');
  r = await apiPost(
    '/api/cards/editor/apply-video-ops',
    {
      source_url: clipA,
      ops: {
        clips: [
          { source_url: clipA, trim_start_sec: 0, trim_end_sec: dA, duration_original_sec: dA, filter: 'vintage' },
          { source_url: clipB, trim_start_sec: 0, trim_end_sec: dB, duration_original_sec: dB, filter: 'cinema' },
        ],
        transitions: [{ type: 'fade', duration_ms: 300 }],
        cover_time_s: 1.0,
      },
    },
    sid
  );
  if (r.status !== 200 || !r.json?.ok) {
    console.error('FAILED fade concat:', r.status, JSON.stringify(r.json).slice(0, 500));
    return false;
  }
  console.log(`    final=${r.json.final_video_url} duration=${r.json.duration_s?.toFixed?.(2)}s`);
  console.log('    steps:', r.json.steps?.join(' | '));
  const finalPathFade = `${UPLOAD_DIR}/${r.json.final_video_url.split('/').pop()}`;
  const coverPathFade = `${UPLOAD_DIR}/${r.json.cover_url.split('/').pop()}`;
  createdFiles.push(finalPathFade, coverPathFade);
  const fadeDur = probeDuration(finalPathFade);
  console.log(`    measured final duration = ${fadeDur.toFixed(2)}s (expected ~3.7s with 0.3s xfade overlap)`);
  if (fadeDur < 3.2 || fadeDur > 4.2) {
    console.error('  duration out of expected fade range');
    return false;
  }

  // 5) legacy single-clip (compat)
  console.log('[5] POST apply-video-ops LEGACY single-clip (no clips array)…');
  r = await apiPost(
    '/api/cards/editor/apply-video-ops',
    {
      source_url: clipA,
      ops: {
        trim: { start_s: 0.2, end_s: 1.8 },
        cover_time_s: 0.5,
      },
    },
    sid
  );
  if (r.status !== 200 || !r.json?.ok) {
    console.error('FAILED legacy:', r.status, JSON.stringify(r.json).slice(0, 500));
    return false;
  }
  console.log(`    legacy final=${r.json.final_video_url}`);
  const finalPathLegacy = `${UPLOAD_DIR}/${r.json.final_video_url.split('/').pop()}`;
  const coverPathLegacy = `${UPLOAD_DIR}/${r.json.cover_url.split('/').pop()}`;
  createdFiles.push(finalPathLegacy, coverPathLegacy);
  const legacyDur = probeDuration(finalPathLegacy);
  console.log(`    legacy duration = ${legacyDur.toFixed(2)}s (expected ~1.6s)`);
  if (legacyDur < 1.3 || legacyDur > 1.9) {
    console.error('  legacy duration out of range');
    return false;
  }

  console.log('### ALL 3 SCENARIOS OK ###');
  return true;
}

run()
  .then((ok) => {
    // cleanup
    for (const f of createdFiles) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => {
    console.error('FATAL', e);
    for (const f of createdFiles) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
    process.exit(1);
  });
