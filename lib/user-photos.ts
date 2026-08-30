/**
 * Photos perso d'un profil (Pascal 2026-08-30) — galerie que le propriétaire remplit lui-même,
 * affichée dans son Discovery. Humanise le profil (« mieux que les profils figés »). Réutilise
 * /api/upload pour l'image ; ici on ne stocke que l'URL. Table légère, créée à la volée.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

let ensured = false;
function ensure(): void {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS user_photos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      caption TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_photos_user ON user_photos(user_id, position, created_at);
  `);
  ensured = true;
}

export interface UserPhoto { id: string; url: string; caption: string | null; created_at: number }

export function listUserPhotos(userId: string, limit = 60): UserPhoto[] {
  ensure();
  return getDb()
    .prepare('SELECT id, url, caption, created_at FROM user_photos WHERE user_id = ? ORDER BY position ASC, created_at DESC LIMIT ?')
    .all(userId, limit) as UserPhoto[];
}

export function addUserPhoto(userId: string, url: string, caption?: string | null): UserPhoto {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare('INSERT INTO user_photos (id, user_id, url, caption, position, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, userId, url, (caption || '').slice(0, 200) || null, 0, now);
  return { id, url, caption: caption ?? null, created_at: now };
}

export function deleteUserPhoto(id: string, userId: string): boolean {
  ensure();
  return getDb().prepare('DELETE FROM user_photos WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}
