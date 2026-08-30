import 'server-only';
/**
 * Talk2Me — Notifications in-app (Pascal 2026-07-28). Table minimale + helpers. Sert (entre autres)
 * l'ENFORCEMENT L1 des sanctions : un avertissement écrit une notif que la personne voit dans
 * /notifications (jusque-là un placeholder). Non-argent. Le push proactif reste best-effort à côté.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface Notif { id: string; user_id: string; type: string; title: string; body: string; link: string | null; created_at: number; read_at: number | null; actor_id?: string | null; actor_avatar?: string | null }

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,           -- 'sanction' | 'vente' | 'systeme' | 'formation' | ...
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, created_at DESC);
  `);
  // Lien de destination optionnel : taper la notif ouvre cette route (Pascal 2026-08-08).
  try { db.exec('ALTER TABLE notifications ADD COLUMN link TEXT'); } catch { /* déjà là */ }
  // Auteur de l'action (ex: qui a liké) → avatar + profil affichés dans la notif. Pascal 2026-08-29.
  try { db.exec('ALTER TABLE notifications ADD COLUMN actor_id TEXT'); } catch { /* déjà là */ }
  try { db.exec('ALTER TABLE notifications ADD COLUMN actor_avatar TEXT'); } catch { /* déjà là */ }
  return db;
}

/** Écrit une notif in-app pour un user. `link` = route au tap ; `actorId`/`actorAvatar` = l'auteur
 *  de l'action (avatar/profil affiché). Best-effort. */
export function createNotif(userId: string, type: string, title: string, body: string, link?: string | null, actorId?: string | null, actorAvatar?: string | null): void {
  if (!userId) return;
  try {
    ensure().prepare('INSERT INTO notifications (id, user_id, type, title, body, link, actor_id, actor_avatar, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), userId, type.slice(0, 40), title.slice(0, 120), body.slice(0, 500), link ? link.slice(0, 200) : null, actorId ?? null, actorAvatar ? actorAvatar.slice(0, 300) : null, Date.now());
  } catch { /* best-effort */ }
}

/** Comme createNotif mais DÉDUPLIQUÉE : n'insère pas si une notif (même user + type + link + acteur)
 *  existe déjà. Ex: un like → 1 seule notif par personne par card (relike ne re-spamme pas). Pascal 2026-08-29. */
export function createNotifOnce(userId: string, type: string, title: string, body: string, link?: string | null, actorId?: string | null, actorAvatar?: string | null): void {
  if (!userId) return;
  try {
    const exists = ensure().prepare('SELECT 1 FROM notifications WHERE user_id = ? AND type = ? AND (link IS ? OR link = ?) AND actor_id IS ? LIMIT 1')
      .get(userId, type.slice(0, 40), link ?? null, link ?? '', actorId ?? null);
    if (exists) return;
  } catch { /* si la requête casse, on retombe sur l'insert simple */ }
  createNotif(userId, type, title, body, link, actorId, actorAvatar);
}

export function listNotifs(userId: string, limit = 50): Notif[] {
  try { return ensure().prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Notif[]; } catch { return []; }
}
export function unreadCount(userId: string): number {
  try { return (ensure().prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as { c: number }).c; } catch { return 0; }
}
export function markAllRead(userId: string): void {
  try { ensure().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), userId); } catch { /* */ }
}
