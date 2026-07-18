/**
 * Talk2Me Mini-Fuzz Validate — post-P0-fix (Pascal #349, 2026-06-04).
 *
 * Subset hôtel + flight + train (régressions P0 du fuzz 100).
 *
 * Verdict attendu après les fix :
 *  - 10 prompts hotel : ≥8 PlaceCard avec tourism=hotel/motel/guest_house/hostel
 *    (ou fallback Booking avec URL search?ss=…)
 *  - 8 prompts flight : ≥6 search_web ou Google Flights URL contenant un query non vide
 *  - 5 prompts train : ≥4 search_web ou SNCF Connect URL
 *
 * Sortie : /home/ubuntu/dashboard/uploads/talk2me_p0fix_validation_minfuzz.md
 *
 * READ-ONLY sur le moteur IA. Aucune modif route.ts / lib/ai/*.
 */

import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PROMPTS as ALL_PROMPTS } from './prompts.mjs';
import { classify } from './analyzer.mjs';

const DB_PATH = process.cwd() + '/data/talktome.db';
const BASE = process.env.TALK2ME_BASE || 'http://127.0.0.1:3010';
const REPORT_MD = '/home/ubuntu/dashboard/uploads/talk2me_p0fix_validation_minfuzz.md';
const GAP_MS = 300;

const PROMPTS = ALL_PROMPTS.filter(p =>
  p.category === 'hotel' || p.category === 'flight' || p.category === 'train'
);

const db = new Database(DB_PATH);

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

async function postChat(token, message) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': `talk2me_session=${token}` },
    body: JSON.stringify({ message }),
  });
  const txt = await res.text();
  const elapsed = Date.now() - t0;
  let json = null;
  try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 500) }; }
  return { status: res.status, json, elapsed_ms: elapsed };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function postChatWithRetry(token, message, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await postChat(token, message);
      if (r.status === 429) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      return r;
    } catch (e) {
      console.warn(`[mini-fuzz] retry attempt ${attempt + 1}: ${e.message}`);
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  return { status: 0, json: null, elapsed_ms: 0 };
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
    if (resp.web_search?.results) for (const r of resp.web_search.results) if (r.url) urls.push(r.url);
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

(async () => {
  console.log(`=== Talk2Me Mini-Fuzz P0 validation (${PROMPTS.length} prompts: hotel+flight+train) ===\n`);
  const t0 = Date.now();

  const user = getOrCreateFuzzUser();
  const token = createSession(user.id);
  console.log(`fuzz-bot id=${user.id.slice(0, 8)} token=${token.slice(0, 12)}…`);
  console.log(`BASE = ${BASE}\n`);

  const results = [];
  let i = 0;
  for (const p of PROMPTS) {
    i++;
    let resp;
    try {
      resp = await postChatWithRetry(token, p.text);
    } catch (e) {
      resp = { status: -1, json: { error: String(e) }, elapsed_ms: 0 };
    }
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

    // Vérif hôtel : si PlaceCard, est-ce que `category` est dans le set hôtel ?
    const placesArr = Array.isArray(resp.json?.places) ? resp.json.places : [];
    const placeCategories = placesArr.map(p => p?.category).filter(Boolean);
    const hasHotelTag = placeCategories.some(c =>
      ['hotel', 'motel', 'guest_house', 'hostel', 'apartment', 'chalet'].includes(c)
    );

    // Vérif booking URL : aucun placeholder + ss= non vide si applicable
    const bookingUrls = urls.filter(u => typeof u === 'string' && u.includes('booking.com'));
    const bookingHasQuery = bookingUrls.some(u => {
      try {
        const url = new URL(u);
        const ss = url.searchParams.get('ss');
        return ss && ss.trim().length > 0;
      } catch { return false; }
    });

    // Vérif flight URL : Google Flights ou search_web non vide
    const flightUrls = urls.filter(u => typeof u === 'string' && (u.includes('google.com/travel/flights') || u.includes('skyscanner') || u.includes('kayak')));
    const flightHasQuery = flightUrls.every(u => !/{[^}]+}/.test(u)) && (flightUrls.length === 0 || flightUrls.some(u => !u.endsWith('?q=') && !u.endsWith('?q=+')));

    const row = {
      id: p.id,
      prompt: p.text,
      category: p.category,
      expected_card: p.expected_card,
      status: resp.status,
      elapsed_ms: resp.elapsed_ms,
      card_kind: cardKind,
      place_categories: placeCategories,
      has_hotel_tag: hasHotelTag,
      booking_urls: bookingUrls,
      booking_has_query: bookingHasQuery,
      flight_urls: flightUrls,
      flight_has_query: flightHasQuery,
      urls,
      text: resp.json?.text || '',
      verdict: verdict.verdict,
      reasons: verdict.reasons,
    };
    results.push(row);

    const icon = verdict.verdict === 'OK' ? '✅' : verdict.verdict === 'WARN' ? '🟡' : verdict.verdict === 'BUG' ? '🟠' : '🔴';
    console.log(
      `[${i}/${PROMPTS.length}] ${icon} ${verdict.verdict} (#${p.id} ${p.category}) ` +
      `"${p.text.slice(0, 40)}" → card=${cardKind || 'none'} ${resp.elapsed_ms}ms` +
      (placeCategories.length ? ` categories=[${placeCategories.slice(0,3).join(',')}]` : '') +
      (verdict.reasons.length ? ` [${verdict.reasons.slice(0, 2).join('; ')}]` : '')
    );

    await sleep(GAP_MS);
  }

  // Build report
  const totalElapsedMs = Date.now() - t0;
  const stats = { OK: 0, WARN: 0, BUG: 0, REGRESSION: 0 };
  for (const r of results) stats[r.verdict] = (stats[r.verdict] || 0) + 1;

  const hotelResults = results.filter(r => r.category === 'hotel');
  const flightResults = results.filter(r => r.category === 'flight');
  const trainResults = results.filter(r => r.category === 'train');

  const hotelOk = hotelResults.filter(r =>
    r.has_hotel_tag || r.booking_has_query
  ).length;
  const flightOk = flightResults.filter(r =>
    r.card_kind === 'SearchResultCard' || (r.flight_urls.length > 0 && r.flight_has_query)
  ).length;
  const trainOk = trainResults.filter(r =>
    r.card_kind === 'SearchResultCard' || r.urls.some(u => u.includes('sncf-connect') || u.includes('sncf'))
  ).length;

  const lines = [];
  lines.push('# Talk2Me Mini-Fuzz P0 Validation (2026-06-04)');
  lines.push('');
  lines.push('Mini-fuzz post-fix P0 issus du rapport `talk2me_fuzz_2026-06-04`. Doctrine `feedback_fuzz_rapport_obligatoire` respectée.');
  lines.push('');
  lines.push('## Résumé exécutif');
  lines.push('');
  lines.push(`- ${PROMPTS.length} prompts testés en ${(totalElapsedMs / 1000).toFixed(1)}s`);
  lines.push(`- ✅ OK : **${stats.OK}**  🟡 WARN : **${stats.WARN}**  🟠 BUG : **${stats.BUG}**  🔴 REGRESSION : **${stats.REGRESSION}**`);
  lines.push('');
  lines.push('## Validation P0 par catégorie');
  lines.push('');
  lines.push(`| Catégorie | Total | OK (validation P0) | Seuil attendu | Verdict |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| hotel | ${hotelResults.length} | ${hotelOk} | ≥8/10 | ${hotelOk >= 8 ? '✅' : '❌'} |`);
  lines.push(`| flight | ${flightResults.length} | ${flightOk} | ≥6/8 | ${flightOk >= 6 ? '✅' : '❌'} |`);
  lines.push(`| train | ${trainResults.length} | ${trainOk} | ≥4/5 | ${trainOk >= 4 ? '✅' : '❌'} |`);
  lines.push('');

  lines.push('### Détail hôtel');
  lines.push('');
  lines.push('| # | Prompt | Card | Place categories (top 3) | Booking ss= ? | Verdict |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of hotelResults) {
    const cats = r.place_categories.slice(0, 3).join(', ') || '—';
    const ss = r.booking_urls.length > 0 ? (r.booking_has_query ? '✅' : '❌ homepage') : '—';
    const icon = r.has_hotel_tag || r.booking_has_query ? '✅' : '❌';
    lines.push(`| ${r.id} | ${escapeMd(r.prompt)} | ${r.card_kind || '_none_'} | ${cats} | ${ss} | ${icon} |`);
  }
  lines.push('');

  lines.push('### Détail flight');
  lines.push('');
  lines.push('| # | Prompt | Card | URL(s) flight | Verdict |');
  lines.push('|---|---|---|---|---|');
  for (const r of flightResults) {
    const u = r.flight_urls.slice(0, 1).map(x => x.slice(0, 60)).join(', ') || '—';
    const ok = r.card_kind === 'SearchResultCard' || (r.flight_urls.length > 0 && r.flight_has_query);
    lines.push(`| ${r.id} | ${escapeMd(r.prompt)} | ${r.card_kind || '_none_'} | ${escapeMd(u)} | ${ok ? '✅' : '❌'} |`);
  }
  lines.push('');

  lines.push('### Détail train');
  lines.push('');
  lines.push('| # | Prompt | Card | URL(s) | Verdict |');
  lines.push('|---|---|---|---|---|');
  for (const r of trainResults) {
    const u = r.urls.slice(0, 1).map(x => x.slice(0, 60)).join(', ') || '—';
    const ok = r.card_kind === 'SearchResultCard' || r.urls.some(x => x.includes('sncf'));
    lines.push(`| ${r.id} | ${escapeMd(r.prompt)} | ${r.card_kind || '_none_'} | ${escapeMd(u)} | ${ok ? '✅' : '❌'} |`);
  }
  lines.push('');

  // Bugs résiduels
  const bugs = results.filter(r => r.verdict === 'BUG' || r.verdict === 'REGRESSION');
  lines.push('## Bugs résiduels');
  lines.push('');
  if (bugs.length === 0) {
    lines.push('_Aucun bug résiduel après fix P0._');
  } else {
    for (const r of bugs) {
      lines.push(`- 🟠 **#${r.id} [${r.category}]** "${escapeMd(r.prompt)}" — ${r.reasons.join('; ')}`);
    }
  }
  lines.push('');

  writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');
  console.log(`\n[mini-fuzz] Rapport MD → ${REPORT_MD}`);
  console.log(`hotel: ${hotelOk}/${hotelResults.length} OK (seuil ${hotelOk >= 8 ? 'OK' : 'NON ATTEINT'})`);
  console.log(`flight: ${flightOk}/${flightResults.length} OK (seuil ${flightOk >= 6 ? 'OK' : 'NON ATTEINT'})`);
  console.log(`train: ${trainOk}/${trainResults.length} OK (seuil ${trainOk >= 4 ? 'OK' : 'NON ATTEINT'})`);
  console.log(`\n=== STATS === OK=${stats.OK} WARN=${stats.WARN} BUG=${stats.BUG} REGRESSION=${stats.REGRESSION}`);
  console.log(`Total elapsed: ${(totalElapsedMs / 1000).toFixed(1)}s`);
  db.close();
})().catch(e => {
  console.error('[mini-fuzz] FATAL', e);
  process.exit(1);
});
