// Talk2Me #386 — Update avatar T2M Officiel vers logo officiel
// Pascal 2026-06-05 — usage : node scripts/update-t2m-avatar.mjs
//
// Met à jour la colonne avatar_url du user T2M Officiel pour pointer
// vers /avatars/t2m-officiel.png (logo T2M officiel généré depuis master).

import Database from 'better-sqlite3';

const DB_PATH = process.cwd() + '/data/talktome.db';
const USER_ID = '8f508701-fbdb-460f-bd95-e826873f79e1';
const NEW_AVATAR = '/avatars/t2m-officiel.png';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const before = db
  .prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?')
  .get(USER_ID);

if (!before) {
  console.error('[ERR] user T2M Officiel introuvable :', USER_ID);
  process.exit(1);
}

console.log('[before]', before);

const res = db
  .prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
  .run(NEW_AVATAR, USER_ID);

console.log('[update]', { changes: res.changes });

const after = db
  .prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?')
  .get(USER_ID);

console.log('[after]', after);
db.close();
