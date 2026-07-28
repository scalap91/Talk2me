import 'server-only';
/**
 * Talk2Me — Notifications in-app (Pascal 2026-07-28). Table minimale + helpers. Sert (entre autres)
 * l'ENFORCEMENT L1 des sanctions : un avertissement écrit une notif que la personne voit dans
 * /notifications (jusque-là un placeholder). Non-argent. Le push proactif reste best-effort à côté.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface Notif { id: string; user_id: string; type: string; title: string; body: string; created_at: number; read_at: number | null }

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,           -- 'sanction' | 'vente' | 'systeme' | ...
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, created_at DESC);
  `);
  return db;
}

/** Écrit une notif in-app pour un user. Best-effort (jamais throw dans un flux appelant). */
export function createNotif(userId: string, type: string, title: string, body: string): void {
  if (!userId) return;
  try {
    ensure().prepare('INSERT INTO notifications (id, user_id, type, title, body, created_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), userId, type.slice(0, 40), title.slice(0, 120), body.slice(0, 500), Date.now());
  } catch { /* best-effort */ }
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
