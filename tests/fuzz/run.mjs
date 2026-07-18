/**
 * Talk2Me Fuzz Runner — 100 conversations IA, audit régressions.
 *
 * Pascal mission 2026-06-04. Doctrine reference_fuzz_rapport_obligatoire.
 *
 * Pipeline :
 *   1. Crée 1 user fuzz-bot directement en DB (évite Brevo / blocklist test).
 *   2. Crée 1 session DB → cookie.
 *   3. Pour chaque prompt (PROMPTS, n=100) :
 *      - POST /api/chat avec cookie + body { message }
 *      - capture response + timing + side-effects DB
 *      - délai 250 ms entre prompts (pas DoS LLM)
 *   4. Classification analyzer → catégories OK / WARN / BUG / REGRESSION.
 *   5. Écrit rapport .md + JSON dans /home/ubuntu/dashboard/uploads/.
 *
 * READ-ONLY sur le moteur IA. Aucune modif /app/api/chat ni /lib/ai/*.
 */

import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PROMPTS } from './prompts.mjs';
import { classify } from './analyzer.mjs';

const DB_PATH = process.cwd() + '/data/talktome.db';
const BASE = 'http://127.0.0.1:3010';
const REPORT_MD = '/home/ubuntu/dashboard/uploads/talk2me_fuzz_2026-06-04_rapport.md';
const REPORT_JSON = '/home/ubuntu/dashboard/uploads/talk2me_fuzz_2026-06-04_data.json';
const GAP_MS = 250;

const db = new Database(DB_PATH);

// ---------------------------------------------------------------------------
// Helpers DB
// ---------------------------------------------------------------------------

function uuid() { return randomUUID(); }

function getOrCreateFuzzUser() {
  const email = 'fuzz-bot-2026-06-04@example.local';
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;

  const id = uuid();
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    if (!db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId)) break;
  }
  const username = `fuzzbot_${randomBytes(2).toString('hex')}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, 'Fuzz Bot', email, now, now, 'T2M de Fuzz Bot');

  const convId = uuid();
  db.prepare(
    `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'agent', ?)`
  ).run(convId, id, now, id);
  db.prepare(
    `INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`
  ).run(convId, id, now);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createSession(userId) {
  const token = uuid();
  const now = Date.now();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token, userId, now, expires
  );
  return token;
}

function countRow(sql, args = []) {
  return db.prepare(sql).get(...args)?.c ?? 0;
}

function dbSnapshot(userId) {
  return {
    habits: countRow('SELECT COUNT(*) AS c FROM user_habits WHERE user_id = ?', [userId]),
    route_learnings: countRow('SELECT COUNT(*) AS c FROM route_learnings WHERE user_id = ?', [userId]),
    messages: countRow(
      `SELECT COUNT(*) AS c FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND c.kind = 'agent'`,
      [userId]
    ),
    ai_memories: countRow('SELECT COUNT(*) AS c FROM ai_memories WHERE user_id = ?', [userId]),
  };
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function postChat(token, message) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `talk2me_session=${token}`,
    },
    body: JSON.stringify({ message }),
  });
  const txt = await res.text();
  const elapsed = Date.now() - t0;
  let json = null;
  try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 500) }; }
  return { status: res.status, json, elapsed_ms: elapsed };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Backoff retry — DeepSeek 429
// ---------------------------------------------------------------------------

async function postChatWithRetry(token, message, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await postChat(token, message);
      // 429 or text mentions rate-limit → backoff
      if (r.status === 429) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`[fuzz] 429 rate-limit, retry in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(wait);
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`[fuzz] fetch error, retry in ${wait}ms: ${e.message}`);
      await sleep(wait);
    }
  }
  if (lastErr) throw lastErr;
  return { status: 0, json: null, elapsed_ms: 0 };
}

// ---------------------------------------------------------------------------
// Report writers
// ---------------------------------------------------------------------------

function quantile(sortedArr, q) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * q));
  return sortedArr[idx];
}

function detectCardKind(resp) {
  if (!resp) return null;
  if (resp.youtube) return 'YouTubeCard';
  if (Array.isArray(resp.places) && resp.places.length > 0) return 'PlaceCard';
  if (resp.placeSearch) return 'PlaceSearchTrigger';
  if (resp.recipe) return 'RecipeCard';
  if (resp.wikipedia) return 'WikipediaCard';
  if (resp.weather) return 'WeatherCard';
  if (Array.isArray(resp.products) && resp.products.length > 0) return 'ProductCard';
  if (resp.web_search && Array.isArray(resp.web_search.results) && resp.web_search.results.length > 0) return 'SearchResultCard';
  return null;
}

function extractUrls(resp) {
  if (!resp) return [];
  const urls = [];
  try {
    if (resp.web_search?.results) {
      for (const r of resp.web_search.results) if (r.url) urls.push(r.url);
    }
    if (resp.youtube?.url) urls.push(resp.youtube.url);
    if (resp.recipe?.url) urls.push(resp.recipe.url);
    if (resp.wikipedia?.url) urls.push(resp.wikipedia.url);
    if (Array.isArray(resp.products)) for (const p of resp.products) if (p.url) urls.push(p.url);
  } catch { /* noop */ }
  return urls;
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
}

function buildReportMd(results, snapshotBefore, snapshotAfter, totalElapsedMs) {
  const lines = [];
  const stats = { OK: 0, WARN: 0, BUG: 0, REGRESSION: 0 };
  const latencies = [];
  for (const r of results) {
    stats[r.verdict] = (stats[r.verdict] || 0) + 1;
    latencies.push(r.elapsed_ms);
  }
  latencies.sort((a, b) => a - b);

  lines.push('# Talk2Me Fuzz IA — 100 conversations (2026-06-04)');
  lines.push('');
  lines.push('Pascal mission audit IA après Phase 1 habits + Consciousness Lot 1/1bis/2.');
  lines.push('Doctrine `reference_fuzz_rapport_obligatoire` respectée.');
  lines.push('');
  lines.push('## Résumé exécutif');
  lines.push('');
  lines.push(`- 100 prompts testés en ${(totalElapsedMs / 1000).toFixed(1)}s`);
  lines.push(`- ✅ OK : **${stats.OK}**`);
  lines.push(`- 🟡 WARNING : **${stats.WARN}**`);
  lines.push(`- 🟠 BUG : **${stats.BUG}**`);
  lines.push(`- 🔴 RÉGRESSION : **${stats.REGRESSION}**`);
  lines.push('');
  lines.push('## Stats perf');
  lines.push('');
  lines.push(`- p50 latence : ${quantile(latencies, 0.5)}ms`);
  lines.push(`- p95 latence : ${quantile(latencies, 0.95)}ms`);
  lines.push(`- p99 latence : ${quantile(latencies, 0.99)}ms`);
  lines.push(`- max latence : ${latencies[latencies.length - 1] || 0}ms`);
  lines.push('');

  // Top regressions
  const regs = results.filter(r => r.verdict === 'REGRESSION');
  const bugs = results.filter(r => r.verdict === 'BUG');
  const warns = results.filter(r => r.verdict === 'WARN');

  lines.push('## Top régressions');
  lines.push('');
  if (regs.length === 0) {
    lines.push('_Aucune régression critique détectée._');
  } else {
    regs.slice(0, 10).forEach((r, i) => {
      lines.push(`${i + 1}. **#${r.id} [${r.category}]** "${escapeMd(r.prompt)}" — ${r.reasons.join(', ')}`);
    });
  }
  lines.push('');

  lines.push('## Top bugs');
  lines.push('');
  if (bugs.length === 0) {
    lines.push('_Aucun bug fonctionnel détecté._');
  } else {
    bugs.slice(0, 10).forEach((r, i) => {
      lines.push(`${i + 1}. **#${r.id} [${r.category}]** "${escapeMd(r.prompt)}" — ${r.reasons.join(', ')}`);
    });
  }
  lines.push('');

  lines.push('## Warnings');
  lines.push('');
  if (warns.length === 0) {
    lines.push('_Aucun warning._');
  } else {
    warns.slice(0, 15).forEach((r, i) => {
      lines.push(`${i + 1}. **#${r.id} [${r.category}]** "${escapeMd(r.prompt)}" — ${r.reasons.join(', ')}`);
    });
  }
  lines.push('');

  // Détails par catégorie
  const categories = [...new Set(results.map(r => r.category))];
  lines.push('## Détails par catégorie');
  lines.push('');
  for (const cat of categories) {
    const rows = results.filter(r => r.category === cat);
    lines.push(`### ${cat} (${rows.length} prompts)`);
    lines.push('');
    lines.push('| # | Prompt | Card détectée | Latence | Verdict |');
    lines.push('|---|---|---|---|---|');
    for (const r of rows) {
      const icon = r.verdict === 'OK' ? '✅' : r.verdict === 'WARN' ? '🟡' : r.verdict === 'BUG' ? '🟠' : '🔴';
      lines.push(
        `| ${r.id} | ${escapeMd(r.prompt)} | ${r.card_kind || '_(none)_'} | ${r.elapsed_ms}ms | ${icon} ${r.verdict}${r.reasons.length ? ' — ' + escapeMd(r.reasons.join('; ')) : ''} |`
      );
    }
    lines.push('');
  }

  // Effets de bord DB
  lines.push('## Effets de bord DB (compteur OBLIGATOIRE — doctrine fuzz)');
  lines.push('');
  lines.push('| Table | Avant | Après | Delta |');
  lines.push('|---|---|---|---|');
  for (const k of ['habits', 'route_learnings', 'messages', 'ai_memories']) {
    lines.push(`| ${k} | ${snapshotBefore[k]} | ${snapshotAfter[k]} | +${snapshotAfter[k] - snapshotBefore[k]} |`);
  }
  lines.push('| user créés | 0 | 1 | +1 (fuzz-bot-2026-06-04@example.local) |');
  lines.push('');

  // Patterns récurrents
  lines.push('## Patterns récurrents détectés');
  lines.push('');
  const patternStats = {};
  for (const r of results) {
    for (const reason of r.reasons) {
      patternStats[reason] = (patternStats[reason] || 0) + 1;
    }
  }
  const sortedPatterns = Object.entries(patternStats).sort((a, b) => b[1] - a[1]);
  if (sortedPatterns.length === 0) {
    lines.push('_Aucun pattern récurrent._');
  } else {
    for (const [pat, count] of sortedPatterns.slice(0, 15)) {
      lines.push(`- **${count}× ${pat}**`);
    }
  }
  lines.push('');

  // Recommandations priorisées
  lines.push('## Recommandations priorisées');
  lines.push('');
  const recos = [];
  const flightRegs = regs.filter(r => r.category === 'flight');
  if (flightRegs.length > 0) {
    recos.push(`P0 — Fix intent \`flight\` (${flightRegs.length} prompts cassés) : \`primary_route.kind=external_redirect\` avec \`url_template\` contenant \`{origin}/{destination}\` jamais remplis. Aucun executor pour primary_route external_redirect (seul fallback gère). Ajouter executor primary_route OU passer flight en \`tool=search_web\` direct.`);
  }
  const urlPlaceholderCount = results.filter(r => r.reasons.some(x => x.includes('placeholder'))).length;
  if (urlPlaceholderCount > 0) {
    recos.push(`P0 — ${urlPlaceholderCount} URLs avec placeholders \`{...}\` non remplacés détectées. Vérifier interpolateString dans fallback-executor.ts + context.origin/destination/location passé depuis route.ts.`);
  }
  const metaLeakCount = results.filter(r => r.reasons.some(x => x.includes('pipeline-leak'))).length;
  if (metaLeakCount > 0) {
    recos.push(`P1 — ${metaLeakCount} fuites pipeline (texte verbalise mémoire/recherche). Étendre scrubForbiddenPhrases.`);
  }
  const wrongCardCount = results.filter(r => r.reasons.some(x => x.includes('wrong-card'))).length;
  if (wrongCardCount > 0) {
    recos.push(`P1 — ${wrongCardCount} mauvais type de card vs intent. Vérifier validator post-result + fallback_chain.`);
  }
  const slowCount = results.filter(r => r.elapsed_ms > 10000).length;
  if (slowCount > 0) {
    recos.push(`P2 — ${slowCount} requêtes >10s. Profiler round2 DeepSeek ou tool handlers Overpass.`);
  }
  if (recos.length === 0) {
    lines.push('_Pipeline globalement sain — aucune reco P0/P1._');
  } else {
    recos.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }
  lines.push('');

  lines.push('## Cleanup');
  lines.push('');
  lines.push('- User `fuzz-bot-2026-06-04@example.local` conservé pour debug ultérieur.');
  lines.push('- Habits/messages persistés (recensés dans le tableau effets-de-bord).');
  lines.push('- Pour purger : `DELETE FROM users WHERE email = \'fuzz-bot-2026-06-04@example.local\';` (cascade selon FK).');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log('=== Talk2Me Fuzz IA — 100 conversations ===\n');
  const t0 = Date.now();

  const user = getOrCreateFuzzUser();
  const token = createSession(user.id);
  console.log(`fuzz-bot id=${user.id} token=${token.slice(0, 12)}…`);
  console.log(`Prompts à exécuter : ${PROMPTS.length}`);
  console.log('');

  const snapshotBefore = dbSnapshot(user.id);
  const results = [];

  let i = 0;
  for (const p of PROMPTS) {
    i++;
    const before = dbSnapshot(user.id);
    let resp;
    try {
      resp = await postChatWithRetry(token, p.text);
    } catch (e) {
      resp = { status: -1, json: { error: String(e) }, elapsed_ms: 0 };
    }
    const after = dbSnapshot(user.id);

    const cardKind = detectCardKind(resp.json);
    const urls = extractUrls(resp.json);
    const verdict = classify({
      prompt: p,
      status: resp.status,
      response: resp.json || {},
      card_kind: cardKind,
      urls,
      elapsed_ms: resp.elapsed_ms,
    });

    const row = {
      id: p.id,
      prompt: p.text,
      category: p.category,
      expected_intent: p.expected_intent,
      expected_card: p.expected_card,
      notes: p.notes,
      status: resp.status,
      elapsed_ms: resp.elapsed_ms,
      card_kind: cardKind,
      text: resp.json?.text || '',
      urls,
      verdict: verdict.verdict,
      reasons: verdict.reasons,
      delta_db: {
        habits: after.habits - before.habits,
        route_learnings: after.route_learnings - before.route_learnings,
        messages: after.messages - before.messages,
        ai_memories: after.ai_memories - before.ai_memories,
      },
      raw_response_keys: Object.keys(resp.json || {}),
    };
    results.push(row);
    const icon = verdict.verdict === 'OK' ? '✅' : verdict.verdict === 'WARN' ? '🟡' : verdict.verdict === 'BUG' ? '🟠' : '🔴';
    console.log(
      `[${i}/${PROMPTS.length}] ${icon} ${verdict.verdict} ` +
      `(#${p.id} ${p.category}) ` +
      `"${p.text.slice(0, 40)}"` +
      ` → card=${cardKind || 'none'} ${resp.elapsed_ms}ms` +
      (verdict.reasons.length ? ` [${verdict.reasons.join('; ')}]` : '')
    );

    await sleep(GAP_MS);
  }

  const snapshotAfter = dbSnapshot(user.id);
  const totalElapsedMs = Date.now() - t0;

  // Write reports
  const md = buildReportMd(results, snapshotBefore, snapshotAfter, totalElapsedMs);
  writeFileSync(REPORT_MD, md, 'utf8');
  console.log(`\n[fuzz] Rapport MD → ${REPORT_MD}`);

  const data = {
    meta: {
      run_at: new Date().toISOString(),
      total_elapsed_ms: totalElapsedMs,
      user_id: user.id,
      user_email: user.email,
      prompt_count: PROMPTS.length,
    },
    snapshot_before: snapshotBefore,
    snapshot_after: snapshotAfter,
    results,
  };
  writeFileSync(REPORT_JSON, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[fuzz] Data JSON → ${REPORT_JSON}`);

  // Summary console
  const stats = { OK: 0, WARN: 0, BUG: 0, REGRESSION: 0 };
  for (const r of results) stats[r.verdict] = (stats[r.verdict] || 0) + 1;
  console.log(`\n=== STATS ===`);
  console.log(`✅ OK         : ${stats.OK}`);
  console.log(`🟡 WARNING    : ${stats.WARN}`);
  console.log(`🟠 BUG        : ${stats.BUG}`);
  console.log(`🔴 RÉGRESSION : ${stats.REGRESSION}`);
  console.log(`Total elapsed : ${(totalElapsedMs / 1000).toFixed(1)}s`);
  console.log(`\nEffets de bord DB :`);
  for (const k of Object.keys(snapshotBefore)) {
    console.log(`  ${k.padEnd(18)} ${snapshotBefore[k]} → ${snapshotAfter[k]} (+${snapshotAfter[k] - snapshotBefore[k]})`);
  }
  console.log('');
})().catch(e => {
  console.error('[fuzz] FATAL', e);
  process.exit(1);
});
