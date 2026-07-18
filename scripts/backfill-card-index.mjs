/**
 * Talk2Me #402 — Backfill card_search FTS5 (Pascal 2026-06-05).
 *
 * Re-construit l'index FTS5 `card_search` + remplit `metadata_map` pour
 * TOUS les posts + direct_cards existants. Idempotent : DELETE+INSERT
 * pour chaque card. Lance manuellement après build :
 *   node scripts/backfill-card-index.mjs
 *
 * IMPORTANT : ré-implémente en JS pur la même logique que
 * /lib/search/metadata-map.ts pour ne pas dépendre d'un runtime TS.
 * Toute modification du mapping DOIT être reportée des 2 côtés. Doctrine
 * [[modular-no-scattered-patches]] : à terme, exposer le module via un
 * endpoint /api/internal/reindex serait plus propre — mais script
 * one-shot suffit pour le backfill initial.
 */

import Database from 'better-sqlite3';

const DB_PATH = process.cwd() + '/data/talktome.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ─────────────────────────────────────────────────────────────────────────────
// Migration idempotente (au cas où le serveur n'aurait pas encore tourné après
// l'ajout des tables dans lib/db.ts).
// ─────────────────────────────────────────────────────────────────────────────

try { db.exec('ALTER TABLE posts ADD COLUMN metadata_map TEXT'); } catch { /* déjà */ }
try { db.exec('ALTER TABLE direct_cards ADD COLUMN metadata_map TEXT'); } catch { /* déjà */ }
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS card_search USING fts5(
      post_id UNINDEXED,
      kind UNINDEXED,
      type,
      title,
      description,
      author,
      tags,
      hashtags,
      body,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
} catch (e) {
  console.error('[backfill] FTS5 table creation failed:', e.message);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (miroir de lib/search/metadata-map.ts)
// ─────────────────────────────────────────────────────────────────────────────

function extractHashtagsFromText(text) {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const tag = m.slice(1).toLowerCase();
    if (!tag) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function safeParseJson(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}

function metadataMapFromText(body) {
  return {
    type: 'texte',
    body: body || '',
    hashtags: extractHashtagsFromText(body || ''),
  };
}

function metadataMapFromDirectMedia({ type, caption, text, media_url }) {
  if (type === 'texte') return metadataMapFromText(text || caption || '');
  if (type === 'image') {
    return {
      type: 'image',
      caption: caption || text || undefined,
      tags: extractHashtagsFromText(`${caption || ''} ${text || ''}`),
      url: media_url || '',
    };
  }
  return {
    type: 'video',
    title: caption || text || undefined,
    url: media_url || '',
  };
}

function buildMetadataMapFromMessages(messages) {
  if (!messages || messages.length === 0) return metadataMapFromText('');

  // YouTube en priorité
  for (const m of messages) {
    const y = safeParseJson(m.youtube);
    if (y && typeof y === 'object') {
      const video_id = y.video_id || '';
      const title = y.title || '';
      const channel = y.channel || '';
      const description = y.description || '';
      const thumbnail = y.thumbnail;
      const allText = `${title} ${description} ${channel} ${m.text || ''}`;
      return {
        type: 'youtube',
        title,
        channel,
        description: description || undefined,
        tags: [],
        hashtags: extractHashtagsFromText(allText),
        video_id,
        thumbnail_url: thumbnail || undefined,
      };
    }
  }

  // TikTok
  for (const m of messages) {
    const t = safeParseJson(m.tiktok);
    if (t && typeof t === 'object') {
      const title = t.title || t.description || '';
      const description = t.description || '';
      const author_handle = t.author_handle || t.user || '';
      const video_id = t.video_id || '';
      const allText = `${title} ${description} ${author_handle} ${m.text || ''}`;
      return {
        type: 'tiktok',
        title,
        author_handle,
        description: description || undefined,
        hashtags: extractHashtagsFromText(allText),
        video_id: video_id || undefined,
      };
    }
  }

  // Fallback texte
  const joinedText = messages
    .map((m) => m.text || '')
    .filter((t) => t.trim().length > 0)
    .join(' ')
    .trim();
  return metadataMapFromText(joinedText);
}

function searchableFromMap(map) {
  switch (map.type) {
    case 'youtube':
      return {
        type: 'youtube',
        title: map.title,
        description: map.description || '',
        author: map.channel,
        tags: (map.tags || []).join(' '),
        hashtags: (map.hashtags || []).join(' '),
        body: `${map.title} ${map.channel} ${map.description || ''}`.trim(),
      };
    case 'spotify':
      return {
        type: 'spotify',
        title: map.title,
        description: map.album || '',
        author: map.artist,
        tags: map.genre || '',
        hashtags: '',
        body: `${map.title} ${map.artist} ${map.album || ''} ${map.genre || ''}`.trim(),
      };
    case 'tiktok':
      return {
        type: 'tiktok',
        title: map.title,
        description: map.description || '',
        author: map.author_handle,
        tags: '',
        hashtags: (map.hashtags || []).join(' '),
        body: `${map.title} ${map.author_handle} ${map.description || ''} ${map.sound || ''}`.trim(),
      };
    case 'article':
      return {
        type: 'article',
        title: map.title,
        description: map.excerpt || '',
        author: map.author || '',
        tags: (map.tags || []).join(' '),
        hashtags: '',
        body: `${map.title} ${map.domain} ${map.author || ''} ${map.excerpt || ''}`.trim(),
      };
    case 'image':
      return {
        type: 'image',
        title: map.caption || '',
        description: '',
        author: '',
        tags: (map.tags || []).join(' '),
        hashtags: '',
        body: `${map.caption || ''} ${(map.tags || []).join(' ')}`.trim(),
      };
    case 'video':
      return {
        type: 'video',
        title: map.title || '',
        description: '',
        author: '',
        tags: '',
        hashtags: '',
        body: (map.title || '').trim(),
      };
    case 'texte':
      return {
        type: 'texte',
        title: '',
        description: '',
        author: '',
        tags: '',
        hashtags: (map.hashtags || []).join(' '),
        body: (map.body || '').trim(),
      };
    case 'place':
      return {
        type: 'place',
        title: map.name,
        description: map.address || '',
        author: '',
        tags: map.category || '',
        hashtags: '',
        body: `${map.name} ${map.address || ''} ${map.category || ''}`.trim(),
      };
    default:
      return {
        type: map.type || 'unknown',
        title: '',
        description: '',
        author: '',
        tags: '',
        hashtags: '',
        body: '',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill posts
// ─────────────────────────────────────────────────────────────────────────────

console.log('[backfill] Starting card_search FTS5 backfill…');

const upsertStmt = db.prepare(
  `INSERT INTO card_search
     (post_id, kind, type, title, description, author, tags, hashtags, body)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const deleteStmt = db.prepare(
  'DELETE FROM card_search WHERE post_id = ? AND kind = ?',
);
const updatePostMetaStmt = db.prepare('UPDATE posts SET metadata_map = ? WHERE id = ?');
const updateDirectMetaStmt = db.prepare('UPDATE direct_cards SET metadata_map = ? WHERE id = ?');

function indexCard(kind, postId, map) {
  const fields = searchableFromMap(map);
  deleteStmt.run(postId, kind);
  upsertStmt.run(
    postId,
    kind,
    fields.type,
    fields.title,
    fields.description,
    fields.author,
    fields.tags,
    fields.hashtags,
    fields.body,
  );
  const json = JSON.stringify(map);
  if (kind === 'post') updatePostMetaStmt.run(json, postId);
  else updateDirectMetaStmt.run(json, postId);
}

let postsIndexed = 0;
let postsSkipped = 0;
const postsByType = {};

const posts = db
  .prepare('SELECT id, message_ids FROM posts WHERE deleted_at IS NULL')
  .all();

const getMsgsStmt = db.prepare(
  'SELECT id, text, youtube, tiktok FROM messages WHERE id IN (SELECT value FROM json_each(?))',
);

for (const post of posts) {
  try {
    let msgIds;
    try { msgIds = JSON.parse(post.message_ids); } catch { msgIds = []; }
    if (!Array.isArray(msgIds) || msgIds.length === 0) {
      postsSkipped++;
      continue;
    }
    const messages = getMsgsStmt.all(JSON.stringify(msgIds));
    const map = buildMetadataMapFromMessages(messages);
    indexCard('post', post.id, map);
    postsIndexed++;
    postsByType[map.type] = (postsByType[map.type] || 0) + 1;
  } catch (e) {
    console.warn('[backfill] post failed', post.id, e.message);
    postsSkipped++;
  }
}

let directIndexed = 0;
let directSkipped = 0;
const directByType = {};

const directs = db
  .prepare('SELECT id, type, caption, text, media_url FROM direct_cards WHERE deleted_at IS NULL')
  .all();

for (const dc of directs) {
  try {
    const map = metadataMapFromDirectMedia({
      type: dc.type,
      caption: dc.caption,
      text: dc.text,
      media_url: dc.media_url,
    });
    indexCard('direct_card', dc.id, map);
    directIndexed++;
    directByType[map.type] = (directByType[map.type] || 0) + 1;
  } catch (e) {
    console.warn('[backfill] direct_card failed', dc.id, e.message);
    directSkipped++;
  }
}

console.log('───────────────────────────────────────────');
console.log('[backfill] DONE');
console.log(`Posts indexed:        ${postsIndexed}  skipped: ${postsSkipped}`);
console.log('  by type:           ', JSON.stringify(postsByType));
console.log(`Direct cards indexed: ${directIndexed}  skipped: ${directSkipped}`);
console.log('  by type:           ', JSON.stringify(directByType));

// Sanity check : combien d'entries dans FTS5 ?
const totalRow = db.prepare('SELECT COUNT(*) AS c FROM card_search').get();
console.log(`Total card_search rows: ${totalRow.c}`);

// Test query : "Young Thug" doit matcher au moins 1 card
const ytTest = db
  .prepare(
    `SELECT post_id, kind, title FROM card_search
      WHERE card_search MATCH 'young thug' ORDER BY rank LIMIT 5`,
  )
  .all();
console.log('Test query "young thug":', JSON.stringify(ytTest, null, 2));

db.close();
