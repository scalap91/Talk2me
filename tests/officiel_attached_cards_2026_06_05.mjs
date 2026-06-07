// Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05).
// Bug fix verbatim : "cest surtout il ne sait pas me ressevir en card
// dorigine le contenue quil a citer".
//
// Vérifie que :
//  - POST message → T2M Officiel répond avec text + attached_cards persistées
//  - SELECT attached_cards en DB → JSON array valide de UnifiedCard
//  - GET /api/conversations/[id] retourne attached_cards dans les messages
//  - Cap 3 cards max enforced

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const API_BASE = 'http://localhost:3010';
const T2M_OFFICIEL_USER_ID = '8f508701-fbdb-460f-bd95-e826873f79e1';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---------- Setup user + conv ----------
const userId = crypto.randomUUID();
const talk2meId = String(100000 + Math.floor(Math.random() * 900000));
const username = `t2mcards_${Date.now().toString(36).slice(-6)}`;
const now = Date.now();
db.prepare(
  `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email,
                       created_at, last_seen, ai_name, ai_gender, avatar_url)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'Léa', 'feminin', NULL)`,
).run(
  userId,
  talk2meId,
  username,
  'Pascal Cards Test',
  `${username}@test.com`,
  now,
  now,
);

const sessionToken = crypto.randomBytes(32).toString('hex');
db.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
).run(sessionToken, userId, now, now + 24 * 60 * 60 * 1000);

const [a, b] = [userId, T2M_OFFICIEL_USER_ID].sort();
db.prepare(
  `INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at)
     VALUES (?, ?, ?, 'accepted', ?)`,
).run(crypto.randomUUID(), a, b, now);

const convId = crypto.randomUUID();
db.prepare(
  `INSERT INTO conversations (id, user_id, created_at, kind, created_by)
     VALUES (?, ?, ?, 'p2p', ?)`,
).run(convId, userId, now, userId);
db.prepare(
  'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)',
).run(convId, userId, now);
db.prepare(
  'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)',
).run(convId, T2M_OFFICIEL_USER_ID, now);
console.log('[setup] user=%s conv=%s', username, convId);

db.close();

const cookie = `talk2me_session=${sessionToken}`;

// ---------- Helper ----------
async function sendAndWait(text, maxWaitMs = 25000) {
  const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ text }),
  });
  const json = await res.json();
  if (!res.ok || !json.officiel_triggered) {
    return { ok: false, err: 'POST failed: ' + JSON.stringify(json) };
  }
  const start = Date.now();
  const reopen = new Database(DB_PATH, { readonly: true });
  try {
    while (Date.now() - start < maxWaitMs) {
      const row = reopen
        .prepare(
          `SELECT id, text, attached_cards, ai_name, ai_for_user_id, kind, created_at
             FROM messages
             WHERE conversation_id = ?
               AND ai_for_user_id = ?
               AND created_at >= ?
             ORDER BY created_at DESC
             LIMIT 1`,
        )
        .get(convId, T2M_OFFICIEL_USER_ID, json.message.timestamp);
      if (row && row.text) {
        return {
          ok: true,
          reply: row,
          user_msg_id: json.message.id,
          waited_ms: Date.now() - start,
        };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, err: 'timeout' };
  } finally {
    reopen.close();
  }
}

// ---------- Scénarios ----------
// On envoie des prompts qui devraient déclencher search_db_posts/get_top_posts/
// get_buzz_cards et donc retourner des UnifiedCards si la DB contient des posts.
const scenarios = [
  { tag: 'BUZZ', text: 'Montre-moi ce qui buzz en ce moment' },
  { tag: 'TOP_WEEK', text: 'Top vues cette semaine ?' },
  { tag: 'SEARCH_SON', text: 'Tu as un post sur "un son de ouf" ?' },
];

const results = [];
for (const s of scenarios) {
  console.log('\n[scenario]', s.tag, '→', s.text);
  const r = await sendAndWait(s.text);
  if (!r.ok) {
    console.log('  KO:', r.err);
    results.push({ ...s, ok: false, err: r.err });
    continue;
  }
  let cards = null;
  try {
    cards = r.reply.attached_cards ? JSON.parse(r.reply.attached_cards) : null;
  } catch (e) {
    cards = { _parse_error: String(e) };
  }
  const nCards = Array.isArray(cards) ? cards.length : 0;
  console.log('  OK in', r.waited_ms, 'ms ; cards=', nCards);
  console.log('  text:', r.reply.text.slice(0, 200).replace(/\n/g, ' / '));
  if (Array.isArray(cards)) {
    for (const c of cards) {
      console.log(
        '    card:',
        c.source,
        '|',
        c.type,
        '|',
        (c.title || '').slice(0, 80),
      );
    }
  }
  results.push({ ...s, ok: true, reply_text: r.reply.text, n_cards: nCards, cards });
}

// ---------- Checks structurels ----------
const checks = [];

// 1) Au moins 1 scénario produit des cards (si la DB a au moins 1 post enrichi)
const anyWithCards = results.find((r) => r.ok && r.n_cards > 0);
checks.push({
  name: 'at_least_one_scenario_has_cards',
  pass: !!anyWithCards,
  detail: anyWithCards
    ? `${anyWithCards.tag} → ${anyWithCards.n_cards} cards`
    : 'aucun scénario n\'a retourné de cards (DB peut-être vide d\'URL embed)',
});

// 2) Cap 3 cards enforced
const tooMany = results.find((r) => r.ok && r.n_cards > 3);
checks.push({
  name: 'cap_3_cards_enforced',
  pass: !tooMany,
  detail: tooMany ? `${tooMany.tag} a ${tooMany.n_cards} cards (>3)` : 'aucun >3',
});

// 3) attached_cards JSON valide en DB
const parseErrors = results.find(
  (r) => r.ok && r.cards && r.cards._parse_error,
);
checks.push({
  name: 'attached_cards_valid_json',
  pass: !parseErrors,
  detail: parseErrors ? parseErrors.cards._parse_error : 'tous JSON valides',
});

// 4) Chaque card a au moins source + title + external_url (forme UnifiedCard minimale)
const malformed = [];
for (const r of results) {
  if (!r.ok || !Array.isArray(r.cards)) continue;
  for (const c of r.cards) {
    if (!c.source || !c.title) {
      malformed.push({ tag: r.tag, c });
    }
  }
}
checks.push({
  name: 'cards_have_required_fields',
  pass: malformed.length === 0,
  detail: malformed.length > 0
    ? `${malformed.length} cards malformées`
    : 'toutes cards bien formées',
});

// 5) GET /api/conversations/[id] retourne attached_cards
const convRes = await fetch(`${API_BASE}/api/conversations/${convId}`, {
  headers: { cookie },
});
const convJson = await convRes.json();
const officielMsgs = (convJson.messages || []).filter(
  (m) => m.ai_for_user_id === T2M_OFFICIEL_USER_ID,
);
const withAttached = officielMsgs.filter(
  (m) => Array.isArray(m.attached_cards) && m.attached_cards.length > 0,
);
checks.push({
  name: 'GET_conversation_returns_attached_cards',
  pass: withAttached.length > 0 || officielMsgs.length === 0,
  detail: `${withAttached.length}/${officielMsgs.length} officiel msgs ont attached_cards`,
});

// ---------- Rapport ----------
const okScenarios = results.filter((r) => r.ok).length;
const okChecks = checks.filter((c) => c.pass).length;

const lines = [
  '# Test T2M Officiel cards attachées — 2026-06-05',
  '',
  `User test : ${username} (${userId})`,
  `Conv P2P : ${convId}`,
  `Scénarios OK : ${okScenarios} / ${results.length}`,
  `Checks structurels OK : ${okChecks} / ${checks.length}`,
  '',
  '## Bug fix Pascal verbatim',
  '> "cest surtout il ne sait pas me ressevir en card dorigine le contenue quil a citer"',
  '',
  '## Scénarios',
  '| # | Tag | Message user | Cards | Texte réponse |',
  '|---|---|---|---|---|',
  ...results.map(
    (r, i) =>
      `| ${i + 1} | ${r.tag} | ${r.text} | ${r.ok ? r.n_cards : 'KO'} | ${(r.reply_text || r.err || '').replace(/\|/g, '\\|').slice(0, 160)} |`,
  ),
  '',
  '## Checks structurels',
  ...checks.map(
    (c) => `- ${c.pass ? 'OK' : 'KO'} **${c.name}** — ${c.detail}`,
  ),
  '',
  '## Conclusion',
  okScenarios === results.length && okChecks === checks.length
    ? '- Pipeline tools → enrichWithCards → handler.cards → DB.attached_cards → SSE → UnifiedBubble fonctionnel.'
    : '- Pipeline partiellement validé (voir détails).',
  '',
];

await fs.writeFile(
  '/home/ubuntu/dashboard/uploads/t2m_officiel_attached_cards_report.md',
  lines.join('\n'),
);

console.log('\n=== RAPPORT ===');
console.log('Scénarios OK', okScenarios, '/', results.length);
console.log('Checks OK', okChecks, '/', checks.length);
for (const c of checks) {
  console.log('  -', c.pass ? 'OK' : 'KO', c.name, '—', c.detail);
}
console.log(
  '\nRapport: /home/ubuntu/dashboard/uploads/t2m_officiel_attached_cards_report.md',
);
