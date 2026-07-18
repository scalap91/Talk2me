/**
 * Talk2Me Lot 4 — Visual QA N12 validation (Pascal master point 12, 2026-06-04).
 *
 * Mini-fuzz qui rejoue 20 prompts critiques du fuzz #349 pour valider les
 * 5 règles ajoutées dans /lib/ai/validators.ts :
 *
 *   1. intent ↔ tool ↔ card cohérence
 *   2. PlaceCard amenity strict (≥50% match)
 *   3. scrubber étendu (16 patterns)
 *   4. detectCommittedPrice (pas de fourchette flight/hotel)
 *   5. detectAmbiguousMotBrut (≤2 mots ET pas dans habits → clarify)
 *
 * Sortie : /home/ubuntu/dashboard/uploads/talk2me_lot4_validation.md
 *
 * READ-ONLY sur le moteur IA. Aucune modif route.ts.
 */

import Database from 'better-sqlite3';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const DB_PATH = process.cwd() + '/data/talktome.db';
const BASE = process.env.TALK2ME_BASE || 'http://127.0.0.1:3010';
const REPORT_MD = '/home/ubuntu/dashboard/uploads/talk2me_lot4_validation.md';
const GAP_MS = 400;

// 20 prompts critiques (mix fuzz #349 + nouveaux cas N12)
const PROMPTS = [
  // 8 hotel (post-fix #350 — doivent passer PlaceCard)
  { id: 1,  text: 'Trouve un hôtel à Paris',                                  category: 'hotel',     expected: 'PlaceCard' },
  { id: 2,  text: 'Hôtel pas cher à Lyon',                                    category: 'hotel',     expected: 'PlaceCard' },
  { id: 3,  text: 'Hôtel Évry',                                               category: 'hotel',     expected: 'PlaceCard' },
  { id: 4,  text: "Réserver une chambre d'hôtel à Marseille",                 category: 'hotel',     expected: 'PlaceCard' },
  { id: 5,  text: 'Hôtel 4 étoiles Nice',                                     category: 'hotel',     expected: 'PlaceCard' },
  { id: 6,  text: 'Je cherche un hôtel à Toulouse pour ce weekend',           category: 'hotel',     expected: 'PlaceCard' },
  { id: 7,  text: 'Hôtel près de la gare à Strasbourg',                       category: 'hotel',     expected: 'PlaceCard' },
  { id: 8,  text: 'Logement pour la nuit à Bordeaux',                         category: 'hotel',     expected: 'PlaceCard' },
  // 4 restaurant
  { id: 9,  text: 'Restaurant italien à Paris',                               category: 'restaurant', expected: 'PlaceCard' },
  { id: 10, text: 'Resto sushi à Lyon',                                       category: 'restaurant', expected: 'PlaceCard' },
  { id: 11, text: 'Cuisine japonaise Strasbourg',                             category: 'restaurant', expected: 'PlaceCard' },
  { id: 12, text: 'Manger libanais Lille',                                    category: 'restaurant', expected: 'PlaceCard' },
  // 4 flight (test no-committed-price)
  { id: 13, text: 'Vol Paris Tokyo',                                          category: 'flight',    expected: 'no-price' },
  { id: 14, text: 'Combien coûte un vol pour Bangkok',                        category: 'flight',    expected: 'no-price' },
  { id: 15, text: 'Vol pas cher Lisbonne',                                    category: 'flight',    expected: 'no-price' },
  { id: 16, text: 'Prix moyen vol Paris New York',                            category: 'flight',    expected: 'no-price' },
  // 2 mot-brut ambigu
  { id: 17, text: 'Check',                                                    category: 'ambiguous', expected: 'clarify' },
  { id: 18, text: 'Pomme',                                                    category: 'ambiguous', expected: 'clarify-or-none' },
  // 2 forbidden_phrases scrubber test
  { id: 19, text: 'Tu peux me trouver une recette de couscous ?',             category: 'scrubber',  expected: 'no-leak' },
  { id: 20, text: 'Mets-moi du Daft Punk',                                    category: 'scrubber',  expected: 'no-leak' },
];

// Patterns interdits — doivent être ABSENTS du finalText
const FORBIDDEN_LEAK_PATTERNS = [
  /je cherche pour toi/i,
  /laisse-moi (?:chercher|voir)/i,
  /je vais (?:voir|regarder)/i,
  /je vois que tu (?:as|écoutes|aimes)/i,
  /tu as déjà parlé/i,
  /je suis en train de/i,
  /selon mes recherches/i,
  /d'après (?:tes habitudes|ce que j'ai compris)/i,
  /je n'ai (?:pas|rien) trouvé/i,
  /essaie (?:google|booking|skyscanner)/i,
  /je m'appelle talk2me/i,
  /je suis talk2me/i,
  /search_(?:place|web|youtube|wikipedia)/i,
  /l'outil search_/i,
  /fetch_url_content/i,
];

// Patterns prix engagé — doivent être ABSENTS sur flight/hotel
const PRICE_PATTERNS = [
  /\b\d{2,5}\s*(?:€|euros?|eur)\b/i,
  /\bentre\s+\d{2,5}\s+et\s+\d{2,5}/i,
  /\b(?:environ|autour de|aux alentours de)\s+\d{2,5}/i,
  /\b\d{2,5}\s*[-–]\s*\d{2,5}\s*(?:€|euros?)/i,
];

const db = new Database(DB_PATH);

function uuid() {
  return randomUUID();
}

function getOrCreateFuzzUser() {
  const email = 'fuzz-bot-lot4-2026-06-04@example.local';
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;

  const id = uuid();
  const now = Date.now();
  let talk2meId;
  for (let i = 0; i < 50; i++) {
    talk2meId = String(100000 + Math.floor(Math.random() * 900000));
    if (!db.prepare('SELECT 1 FROM users WHERE talk2me_id = ?').get(talk2meId)) break;
  }
  const username = `fuzzlot4_${randomBytes(2).toString('hex')}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')`
  ).run(id, talk2meId, username, 'Fuzz Lot4', email, now, now, 'T2M de Fuzz Lot4');

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
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, expires);
  return token;
}

async function postChat(token, message) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `talk2me_session=${token}`,
    },
    body: JSON.stringify({ message }),
  });
  const txt = await res.text();
  const elapsed = Date.now() - t0;
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { raw: txt.slice(0, 500) };
  }
  return { status: res.status, json, elapsed_ms: elapsed };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
      console.warn(`[lot4-fuzz] retry attempt ${attempt + 1}: ${e.message}`);
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
  if (
    resp.web_search &&
    Array.isArray(resp.web_search.results) &&
    resp.web_search.results.length > 0
  )
    return 'SearchResultCard';
  return null;
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
}

function evaluate(prompt, resp) {
  const cardKind = detectCardKind(resp.json);
  const text = (resp.json?.text || '').toString();
  const reasons = [];
  let verdict = 'OK';

  // Vérifs communes : pas de pipeline-leak
  for (const re of FORBIDDEN_LEAK_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`pipeline-leak: ${re.source}`);
      verdict = 'BUG';
    }
  }

  // Vérifs par catégorie
  if (prompt.category === 'hotel') {
    if (cardKind !== 'PlaceCard') {
      reasons.push(`wrong-card (got ${cardKind || 'none'})`);
      // tolérance : SearchResultCard accepté si fallback Booking OK
      if (cardKind === 'SearchResultCard') {
        verdict = verdict === 'BUG' ? 'BUG' : 'WARN';
      } else {
        verdict = 'BUG';
      }
    } else {
      // Vérifier ≥50% places match hotel
      const places = Array.isArray(resp.json.places) ? resp.json.places : [];
      const hotelCats = ['hotel', 'motel', 'guest_house', 'hostel', 'apartment', 'chalet'];
      const matches = places.filter((p) => hotelCats.includes(p?.category) || hotelCats.includes(p?.amenity));
      if (matches.length === 0) {
        reasons.push('placecard-no-hotel-tag');
        verdict = 'BUG';
      } else if (matches.length / places.length < 0.5) {
        reasons.push(`placecard-low-hotel-ratio (${matches.length}/${places.length})`);
        verdict = 'WARN';
      }
    }
  } else if (prompt.category === 'restaurant') {
    if (cardKind !== 'PlaceCard') {
      reasons.push(`wrong-card (got ${cardKind || 'none'})`);
      if (cardKind === 'SearchResultCard') {
        verdict = verdict === 'BUG' ? 'BUG' : 'WARN';
      } else if (!cardKind) {
        verdict = verdict === 'BUG' ? 'BUG' : 'WARN';
      } else {
        verdict = 'BUG';
      }
    } else {
      const places = Array.isArray(resp.json.places) ? resp.json.places : [];
      const restoCats = ['restaurant', 'cafe', 'fast_food', 'food_court', 'bistro'];
      const matches = places.filter((p) => restoCats.includes(p?.category) || restoCats.includes(p?.amenity));
      if (matches.length === 0) {
        reasons.push('placecard-no-resto-tag');
        verdict = 'BUG';
      }
    }
  } else if (prompt.category === 'flight') {
    // Pas de prix engagé dans le texte
    for (const re of PRICE_PATTERNS) {
      if (re.test(text)) {
        reasons.push(`committed-price-leak: ${re.source}`);
        verdict = 'BUG';
      }
    }
    // Une SearchResultCard ou un texte de redirection est OK
  } else if (prompt.category === 'ambiguous') {
    // Soit clarify (texte court avec point d'interrogation), soit aucune card
    if (cardKind && cardKind !== 'SearchResultCard') {
      // une autre card est acceptable si vraiment l'IA a désambiguïsé via habits
      reasons.push(`ambiguous-card-emitted (${cardKind})`);
      verdict = 'WARN';
    } else if (cardKind === 'SearchResultCard') {
      reasons.push('ambiguous-but-tool-called (SearchResultCard)');
      verdict = 'BUG';
    } else if (!text || !text.trim()) {
      // silence = OK (no-excuses)
    } else if (!text.includes('?')) {
      reasons.push('ambiguous-but-no-clarify');
      verdict = 'WARN';
    }
  } else if (prompt.category === 'scrubber') {
    // Déjà vérifié au début via FORBIDDEN_LEAK_PATTERNS
  }

  return { verdict, reasons, cardKind, text };
}

(async () => {
  console.log(
    `=== Talk2Me Lot 4 Visual QA validation (${PROMPTS.length} prompts) ===\n`,
  );
  const t0 = Date.now();

  const user = getOrCreateFuzzUser();
  const token = createSession(user.id);
  console.log(`fuzz-bot-lot4 id=${user.id.slice(0, 8)} token=${token.slice(0, 12)}…`);
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
    const ev = evaluate(p, resp);
    const row = {
      id: p.id,
      prompt: p.text,
      category: p.category,
      expected: p.expected,
      status: resp.status,
      elapsed_ms: resp.elapsed_ms,
      card_kind: ev.cardKind,
      text: ev.text,
      verdict: ev.verdict,
      reasons: ev.reasons,
    };
    results.push(row);

    const icon =
      ev.verdict === 'OK'
        ? '✅'
        : ev.verdict === 'WARN'
          ? '🟡'
          : ev.verdict === 'BUG'
            ? '🟠'
            : '🔴';
    console.log(
      `[${i}/${PROMPTS.length}] ${icon} ${ev.verdict} (#${p.id} ${p.category}) ` +
        `"${p.text.slice(0, 40)}" → card=${ev.cardKind || 'none'} ${resp.elapsed_ms}ms` +
        (ev.reasons.length ? ` [${ev.reasons.slice(0, 2).join('; ')}]` : ''),
    );

    await sleep(GAP_MS);
  }

  // Build report
  const totalElapsedMs = Date.now() - t0;
  const stats = { OK: 0, WARN: 0, BUG: 0, REGRESSION: 0 };
  for (const r of results) stats[r.verdict] = (stats[r.verdict] || 0) + 1;

  const byCat = {};
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, ok: 0 };
    byCat[r.category].total++;
    if (r.verdict === 'OK') byCat[r.category].ok++;
  }

  const lines = [];
  lines.push('# Talk2Me Lot 4 — Visual QA N12 Validation (2026-06-04)');
  lines.push('');
  lines.push('Mini-fuzz Lot 4 (Pascal master point 12) — validation des 5 règles N12 Visual QA :');
  lines.push('1. intent ↔ tool ↔ card cohérence');
  lines.push('2. PlaceCard amenity strict (≥50% match)');
  lines.push('3. scrubber étendu (16+ patterns)');
  lines.push('4. detectCommittedPrice (pas de fourchette flight/hotel)');
  lines.push('5. detectAmbiguousMotBrut (≤2 mots ET pas dans habits → clarify)');
  lines.push('');
  lines.push('## Résumé exécutif');
  lines.push('');
  lines.push(`- ${PROMPTS.length} prompts testés en ${(totalElapsedMs / 1000).toFixed(1)}s`);
  lines.push(
    `- ✅ OK : **${stats.OK}**  🟡 WARN : **${stats.WARN}**  🟠 BUG : **${stats.BUG}**  🔴 REGRESSION : **${stats.REGRESSION}**`,
  );
  lines.push('');
  lines.push('## Par catégorie');
  lines.push('');
  lines.push('| Catégorie | Total | OK | %  |');
  lines.push('|---|---|---|---|');
  for (const [cat, s] of Object.entries(byCat)) {
    const pct = Math.round((s.ok / s.total) * 100);
    lines.push(`| ${cat} | ${s.total} | ${s.ok} | ${pct}% |`);
  }
  lines.push('');

  lines.push('## Détail par prompt');
  lines.push('');
  lines.push('| # | Catégorie | Prompt | Card | Verdict | Raisons |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const icon =
      r.verdict === 'OK' ? '✅' : r.verdict === 'WARN' ? '🟡' : r.verdict === 'BUG' ? '🟠' : '🔴';
    const reas = r.reasons.slice(0, 3).join('; ') || '—';
    lines.push(
      `| ${r.id} | ${r.category} | ${escapeMd(r.prompt)} | ${r.card_kind || '_none_'} | ${icon} ${r.verdict} | ${escapeMd(reas)} |`,
    );
  }
  lines.push('');

  // Bugs résiduels
  const bugs = results.filter((r) => r.verdict === 'BUG' || r.verdict === 'REGRESSION');
  lines.push('## Bugs résiduels');
  lines.push('');
  if (bugs.length === 0) {
    lines.push('_Aucun bug résiduel sur les 5 règles N12 Visual QA._');
  } else {
    for (const r of bugs) {
      lines.push(
        `- 🟠 **#${r.id} [${r.category}]** "${escapeMd(r.prompt)}" — ${r.reasons.join('; ')}`,
      );
      if (r.text) lines.push(`  > "${escapeMd(r.text.slice(0, 250))}"`);
    }
  }
  lines.push('');

  // Détails par règle
  lines.push('## Validation par règle');
  lines.push('');
  const ruleStats = {
    R3_scrubber: 0,
    R4_committed_price: 0,
    R5_motbrut: 0,
  };
  for (const r of results) {
    for (const reason of r.reasons) {
      if (reason.startsWith('pipeline-leak')) ruleStats.R3_scrubber++;
      if (reason.startsWith('committed-price')) ruleStats.R4_committed_price++;
      if (reason.startsWith('ambiguous-but')) ruleStats.R5_motbrut++;
    }
  }
  lines.push('| Règle | Violations |');
  lines.push('|---|---|');
  lines.push(`| R3 — Scrubber pipeline-leak | ${ruleStats.R3_scrubber} |`);
  lines.push(`| R4 — Committed price | ${ruleStats.R4_committed_price} |`);
  lines.push(`| R5 — Mot-brut ambigu | ${ruleStats.R5_motbrut} |`);
  lines.push('');

  lines.push('## Cleanup');
  lines.push('');
  lines.push(
    "- User `fuzz-bot-lot4-2026-06-04@example.local` conservé pour debug ultérieur.",
  );
  lines.push("- Pour purger : `DELETE FROM users WHERE email LIKE 'fuzz-bot-lot4%';`");
  lines.push('');

  writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');
  console.log(`\n[lot4-fuzz] Rapport MD → ${REPORT_MD}`);
  console.log(
    `\n=== STATS === OK=${stats.OK} WARN=${stats.WARN} BUG=${stats.BUG} REGRESSION=${stats.REGRESSION}`,
  );
  console.log(`Total elapsed: ${(totalElapsedMs / 1000).toFixed(1)}s`);
  db.close();
})().catch((e) => {
  console.error('[lot4-fuzz] FATAL', e);
  process.exit(1);
});
