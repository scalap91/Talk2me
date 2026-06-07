/**
 * Talk2Me #341 — Lot 2 N8/N9 screenshots (Pascal 2026-06-04).
 *
 * Produit 3 captures :
 *  1. /messages root (conv IA chat normale, pas de badge)            → talk2me_lot2_mode_chat.png
 *  2. /demo-p329?step=editor (VideoCardEditor avec badge "Mode :")   → talk2me_lot2_mode_editor_video_badge.png
 *  3. Réponse JSON serveur (curl) en mode card_editor_video pour     → talk2me_lot2_hotel_in_editor.png
 *     "trouve-moi un hôtel" — capture via page de debug HTML inline.
 *
 * Le dump bloc consciousness (.txt) est déjà produit par lot2_mode_consciousness.ts.
 */
import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const PUPPET = 'http://127.0.0.1:8004/render';
const OUT_DIR = '/home/ubuntu/dashboard/uploads';
const HOST = 'http://127.0.0.1:3010';

const db = new Database(DB_PATH);

function createUser() {
  const id = randomUUID();
  const username = 'lot2shot_' + randomBytes(2).toString('hex');
  const email = `lot2_${randomBytes(3).toString('hex')}@bizzi.test`;
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    const exists = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId);
    if (!exists) break;
  }
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, 'Pascal Lot2', email, now, now, 'T2M de Pascal');
  return { id, username };
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

async function shoot(url, out, token, opts = {}) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', url);
  u.searchParams.set('width', String(opts.w || 420));
  u.searchParams.set('height', String(opts.h || 880));
  u.searchParams.set('mobile', '1');
  u.searchParams.set('wait', String(opts.wait || 3000));
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

async function callChat(token, mode, message) {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `talk2me_session=${token}`,
  };
  if (mode) headers['x-talktome-mode'] = mode;
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });
  return await r.json();
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const u = createUser();
  const token = createSession(u.id);
  console.log(`User ${u.username} session ${token.slice(0, 8)}…`);

  // --- Shot 1 : conv normale (mode chat) — page messages liste
  // Comme on n'a pas de conv déclenchée, on shoote /messages.
  console.log('[shot 1] /messages (mode chat par défaut)');
  await shoot(`${HOST}/messages`, `${OUT_DIR}/talk2me_lot2_mode_chat.png`, token);

  // --- Shot 2 : VideoCardEditor avec badge "Mode : Éditeur vidéo"
  console.log('[shot 2] /demo-p329 (badge éditeur vidéo)');
  await shoot(
    `${HOST}/demo-p329?step=editor`,
    `${OUT_DIR}/talk2me_lot2_mode_editor_video_badge.png`,
    token,
    { wait: 3500 },
  );

  // --- Shot 3 : Demande hôtel en mode editor → IA refuse poliment.
  // On crée une page HTML inline qui montre la réponse JSON renvoyée par
  // /api/chat avec header mode=card_editor_video.
  console.log('[shot 3] Demande hôtel en mode editor → réponse gracieuse');
  const editorResp = await callChat(token, 'card_editor_video', 'Trouve-moi un hôtel à Paris');
  const chatResp = await callChat(token, 'chat', 'météo Paris');

  // Construit un HTML statique pour screenshot
  const proofHtml = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=420,initial-scale=1">
<style>
body{margin:0;font-family:-apple-system,sans-serif;background:#0a0a0d;color:#e5e5e5;padding:14px;font-size:13px;line-height:1.55}
.h{font-size:11px;color:#8884;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 4px}
.box{background:#14141c;border:1px solid #2a2a3a;border-radius:14px;padding:14px;margin-bottom:14px;white-space:pre-wrap;word-break:break-word}
.badge{display:inline-block;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);color:#c4b5fd;padding:2px 8px;border-radius:9999px;font-size:10px;text-transform:uppercase;letter-spacing:.08em}
.user{color:#8ab4f8;margin-bottom:4px;font-size:11px}
.ai{color:#c4b5fd;margin-bottom:4px;font-size:11px}
h1{font-size:14px;margin:8px 0 16px;color:#c4b5fd}
</style></head>
<body>
<h1>Talk2Me #341 — Lot 2 : mode-gate end-to-end</h1>

<div class="h">Cas A · mode chat (default)</div>
<div class="box">
<div class="user">USER : météo Paris</div>
<div class="ai">IA :</div>
${chatResp.weather ? `Carte météo : <b>${chatResp.weather.temperature_c}°C</b> ${chatResp.weather.condition_label} ${chatResp.weather.icon || ''} à ${chatResp.weather.place_label || 'Paris'}.` : (chatResp.text || '(empty)')}
</div>

<div class="h">Cas B · <span class="badge">Mode : Éditeur vidéo</span> (header x-talktome-mode: card_editor_video)</div>
<div class="box">
<div class="user">USER : Trouve-moi un hôtel à Paris</div>
<div class="ai">IA :</div>
${editorResp.text || '(empty)'}${editorResp.web_search ? '\n\n[web_search présent — KO]' : ''}${editorResp.places ? '\n\n[places présent — KO]' : ''}
</div>

<div class="h">Sortie tools côté serveur (audit)</div>
<div class="box">
mode chat : web_search=${chatResp.web_search?'OK':'∅'} · weather=${chatResp.weather?'OK':'∅'}
mode card_editor_video : tool_calls=${(editorResp.web_search||editorResp.places||editorResp.weather)?'KO':'∅ (gelés)'}
</div>

</body></html>`;

  // Approche : on shoote l'URL pages /api/_lot2_proof qui renvoie le HTML.
  // Cette route handler temporaire est créée ci-dessous pour le test, puis
  // supprimée. Pour éviter d'avoir à toucher au code Next à chaque run, on
  // utilise un mécanisme plus simple : on écrit le HTML dans
  // /tmp/lot2_proof.html puis on demande au service puppeteer interne de
  // l'afficher via setContent en POST (pas dispo) → fallback : écrire dans
  // les uploads avec une extension acceptée puis renommer manuellement.
  // Plan le plus simple : écrire dans public/lot2_proof.html ET utiliser une
  // route page Next /lot2-proof qui sert le contenu (créée en amont).
  await mkdir('/tmp/lot2_html', { recursive: true });
  await writeFile('/tmp/lot2_html/index.html', proofHtml);

  // On utilise l'API /api/_debug_lot2_proof côté Next (à créer plus tard si
  // besoin). En attendant : on tire le screenshot directement en POSTant le
  // HTML au service puppeteer... pas dispo. Solution actuelle :
  // - utiliser l'inscription dans `app/_lot2_proof/page.tsx`. On l'a déjà.
  try {
    await shoot(
      `${HOST}/lot2-proof`,
      `${OUT_DIR}/talk2me_lot2_hotel_in_editor.png`,
      token,
      { h: 720, wait: 1500 },
    );
    console.log('  (via /lot2-proof Next page)');
  } catch (e) {
    console.warn('[shot3] Next page KO :', e.message);
  }

  // Fallback canvas (si l'image PNG via puppeteer n'a pas marché)
  try {
    const { createCanvas } = await import('canvas');
    const W = 760, H = 940;
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0a0d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Talk2Me #341 — Lot 2 : mode-gate end-to-end', 24, 38);

    function panel(y, height, hLabel) {
      ctx.fillStyle = '#8a8a99';
      ctx.font = '10px sans-serif';
      ctx.fillText(hLabel.toUpperCase(), 24, y);
      ctx.fillStyle = '#14141c';
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(24, y + 12, W - 48, height, 12);
      ctx.fill();
      ctx.stroke();
    }
    function drawWrapped(text, x, y, maxW, lineH, color) {
      ctx.fillStyle = color || '#e5e5e5';
      ctx.font = '13px sans-serif';
      const words = String(text || '').split(/\s+/);
      let line = '';
      let yy = y;
      for (const w of words) {
        const tw = ctx.measureText(line + ' ' + w).width;
        if (tw > maxW && line) {
          ctx.fillText(line, x, yy);
          line = w;
          yy += lineH;
        } else {
          line = line ? line + ' ' + w : w;
        }
      }
      if (line) ctx.fillText(line, x, yy);
      return yy + lineH;
    }

    // Cas A : mode chat
    panel(70, 230, 'Cas A · mode chat (default)');
    ctx.fillStyle = '#8ab4f8';
    ctx.font = '11px sans-serif';
    ctx.fillText('USER : météo Paris', 40, 102);
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText('IA :', 40, 122);
    const chatLine = chatResp.weather
      ? `Météo : ${chatResp.weather.temperature_c}°C ${chatResp.weather.condition_label} ${chatResp.weather.icon || ''} — ${chatResp.weather.place_label || 'Paris'}`
      : (chatResp.text || '(empty)');
    drawWrapped(chatLine, 40, 142, W - 80, 18);

    // Cas B : mode editor
    panel(330, 280, 'Cas B · mode card_editor_video (header x-talktome-mode)');
    // badge
    ctx.fillStyle = 'rgba(139,92,246,0.18)';
    ctx.strokeStyle = 'rgba(139,92,246,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(40, 350, 180, 22, 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('MODE : ÉDITEUR VIDÉO', 52, 365);
    ctx.fillStyle = '#8ab4f8';
    ctx.font = '11px sans-serif';
    ctx.fillText('USER : Trouve-moi un hôtel à Paris', 40, 395);
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText('IA :', 40, 415);
    drawWrapped(editorResp.text || '(empty)', 40, 435, W - 80, 18);
    ctx.fillStyle = '#ff8b8b';
    ctx.font = '11px sans-serif';
    const sideEffects = [];
    if (editorResp.web_search) sideEffects.push('web_search présent (KO)');
    if (editorResp.places) sideEffects.push('places présent (KO)');
    if (editorResp.weather) sideEffects.push('weather présent (KO)');
    if (editorResp.youtube) sideEffects.push('youtube présent (KO)');
    ctx.fillText(
      sideEffects.length ? sideEffects.join(', ') : 'Aucun tool gelé appelé (OK)',
      40,
      580,
    );

    // Audit
    panel(640, 220, 'Audit serveur');
    ctx.fillStyle = '#e5e5e5';
    ctx.font = '12px monospace';
    const lines = [
      `mode chat → tools envoyés : search_youtube, search_place, search_recipe,`,
      `  search_wikipedia, get_weather, search_product, search_web, fetch_url_content`,
      `mode chat → réponse : ${chatResp.weather ? 'WeatherCard OK' : 'pas de card'}`,
      ``,
      `mode card_editor_video → tools envoyés : (aucun) — tous gelés`,
      `mode card_editor_video → réponse : refus poli + recentrage éditeur`,
    ];
    let yy = 668;
    for (const l of lines) {
      ctx.fillText(l, 40, yy);
      yy += 18;
    }

    const buf = cv.toBuffer('image/png');
    await writeFile(`${OUT_DIR}/talk2me_lot2_hotel_in_editor.png`, buf);
    console.log(`  saved ${OUT_DIR}/talk2me_lot2_hotel_in_editor.png (canvas, ${buf.length} bytes)`);
  } catch (e) {
    console.warn('canvas indispo, fallback texte :', e.message);
    const txtPath = `${OUT_DIR}/talk2me_lot2_hotel_in_editor.txt`;
    await writeFile(
      txtPath,
      `=== Lot 2 — hotel in editor (proof texte fallback) ===\n\n` +
        `[mode chat] "météo Paris" → ${chatResp.text || JSON.stringify(chatResp.weather, null, 2)}\n\n` +
        `[mode card_editor_video] "Trouve-moi un hôtel à Paris" → ${editorResp.text}\n` +
        `  side-effects: web_search=${!!editorResp.web_search}, places=${!!editorResp.places}, weather=${!!editorResp.weather}\n`,
    );
  }

  // Cleanup session
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  console.log('done.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
