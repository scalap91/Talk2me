// Talk2Me #424 — Seed Shop : produits poussés par T2M Officiel.
//
// ⚠️ DÉCISION Pascal 2026-06-07 : le PUSH GÉNÉRIQUE pollue (catalogue de pub
// hors-sol, contraire à [[talk2me-card-vivante]] "affiliation contextuelle
// naturelle, jamais pub agressive" + [[talk2me-hub-universel]]). On garde le
// tuyau mais on NE pousse PLUS de produits génériques automatiquement. Le Shop
// ne se remplit que de produits contextuels/curés.
//
// Ce script est donc VERROUILLÉ : il refuse de tourner sans le flag explicite
// CONFIRM_GENERIC=1 (gardé comme référence technique pour un futur pusher curé).
//
// Doctrine [[content-grounding]] : produits RÉELS uniquement (scrape AliExpress).
// Usage (volontairement bridé) : CONFIRM_GENERIC=1 node scripts/seed-shop-officiel.mjs

import Database from 'better-sqlite3';
import crypto from 'node:crypto';

if (process.env.CONFIRM_GENERIC !== '1') {
  console.error(
    '[shop-seed] BLOQUÉ : le push générique pollue (décision Pascal 2026-06-07).\n' +
      'Relance avec CONFIRM_GENERIC=1 seulement si tu sais ce que tu fais.'
  );
  process.exit(1);
}

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const PORT = process.env.PORT || 3010;
const OFFICIEL =
  process.env.T2M_OFFICIEL_USER_ID || '8f508701-fbdb-460f-bd95-e826873f79e1';

// Requêtes "tendance" génériques grand public (le scrape ramène le réel).
// SANS ACCENT : le scraper AliExpress ne matche pas les requêtes accentuées.
const QUERIES = [
  'ecouteurs bluetooth',
  'montre connectee',
  'mini projecteur',
  'chargeur sans fil',
  'aspirateur robot',
  'lampe led chambre',
  'camera surveillance wifi',
  'enceinte bluetooth',
  'casque gaming',
  'drone camera',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scraper flaky → retry. Renvoie [] après N tentatives infructueuses.
async function fetchProducts(q, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(
        `http://127.0.0.1:${PORT}/api/search/product?query=${encodeURIComponent(q)}&limit=6`,
        { signal: AbortSignal.timeout(45000) }
      );
      if (r.ok) {
        const j = await r.json();
        const p = Array.isArray(j?.products) ? j.products : [];
        if (p.length) return p;
      }
    } catch (e) {
      console.error('[shop-seed] fetch KO', q, e?.message);
    }
    await sleep(2500); // laisse respirer la source entre tentatives
  }
  return [];
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const u = db.prepare('SELECT id FROM users WHERE id = ?').get(OFFICIEL);
if (!u) {
  console.error('[shop-seed] T2M Officiel introuvable:', OFFICIEL);
  process.exit(1);
}

// Conversation agent de T2M Officiel (créée si absente).
let conv = db
  .prepare(
    "SELECT id FROM conversations WHERE user_id = ? AND (kind IS NULL OR kind = 'agent') ORDER BY created_at DESC LIMIT 1"
  )
  .get(OFFICIEL);
if (!conv) {
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    db.prepare(
      "INSERT INTO conversations (id, user_id, created_at, kind, created_by) VALUES (?, ?, ?, 'agent', ?)"
    ).run(id, OFFICIEL, now, OFFICIEL);
  } catch {
    db.prepare(
      'INSERT INTO conversations (id, user_id, created_at) VALUES (?, ?, ?)'
    ).run(id, OFFICIEL, now);
  }
  conv = { id };
}
const convId = conv.id;

// Idempotence ACCUMULATIVE : on ne remplace QUE la requête qu'on réussit à
// re-scraper (les autres seeds restent en place). Relancer le script enrichit
// donc le catalogue au fil des runs (le scraper étant flaky/rate-limité).
function replaceSeedForQuery(text) {
  const old = db
    .prepare('SELECT id FROM messages WHERE conversation_id = ? AND text = ?')
    .all(convId, text);
  if (!old.length) return;
  const oldIds = new Set(old.map((m) => m.id));
  const posts = db
    .prepare('SELECT id, message_ids FROM posts WHERE user_id = ? AND conversation_id = ?')
    .all(OFFICIEL, convId);
  const delPost = db.prepare('DELETE FROM posts WHERE id = ?');
  for (const p of posts) {
    try {
      const ids = JSON.parse(p.message_ids || '[]');
      if (ids.some((x) => oldIds.has(x))) delPost.run(p.id);
    } catch {
      /* ignore */
    }
  }
  const delMsg = db.prepare('DELETE FROM messages WHERE id = ?');
  for (const id of oldIds) delMsg.run(id);
}

const insMsg = db.prepare(
  'INSERT INTO messages (id, conversation_id, role, text, links, created_at, products) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insPost = db.prepare(
  'INSERT INTO posts (id, user_id, conversation_id, message_ids, created_at) VALUES (?, ?, ?, ?, ?)'
);

let total = 0;
for (const q of QUERIES) {
  const products = await fetchProducts(q);
  if (!products.length) {
    console.log('[shop-seed] skip (0 produit)', q);
    await sleep(1500);
    continue;
  }
  const text = `🔥 Tendance — ${q}`;
  replaceSeedForQuery(text); // rafraîchit cette requête sans toucher aux autres
  const mid = crypto.randomUUID();
  const now = Date.now();
  insMsg.run(mid, convId, 'agent', text, '[]', now, JSON.stringify(products));
  const pid = crypto.randomUUID();
  insPost.run(pid, OFFICIEL, convId, JSON.stringify([mid]), now);
  total++;
  console.log('[shop-seed] OK', q, '→', products.length, 'produits');
  await sleep(1500); // anti-throttle entre requêtes
}

console.log(`[shop-seed] TERMINÉ — ${total} posts Shop poussés par T2M Officiel`);
db.close();
