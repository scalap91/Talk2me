/**
 * Talk2Me — MODÉRATION & SÉCURITÉ UGC (Pascal 2026-06-24, prépa App Store).
 * Fonctions OBLIGATOIRES Apple (Guideline 1.2 contenu utilisateur + 5.1.1 compte) :
 *   - Bloquer / débloquer un utilisateur
 *   - Signaler un utilisateur
 *   - Signaler un contenu (card/post/message)
 *   - Supprimer son compte (anonymisation + purge sessions + soft-delete contenus)
 *
 * Module isolé : tables auto-créées au 1ᵉʳ import, fonctions pures sur getDb().
 * Soft-delete partout (doctrine CRUD). PII air-gap : on ne sort jamais email/talk2me_id.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export type ReportReason = 'spam' | 'harcelement' | 'contenu_sexuel' | 'violence' | 'arnaque' | 'haine' | 'autre';
export const REPORT_REASONS: ReportReason[] = ['spam', 'harcelement', 'contenu_sexuel', 'violence', 'arnaque', 'haine', 'autre'];
export type ContentKind = 'direct_card' | 'post' | 'message';

let _init = false;
function ensure() {
  if (_init) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(blocker_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
    CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

    CREATE TABLE IF NOT EXISTS user_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      reported_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by TEXT,
      action_taken TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS content_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      content_kind TEXT NOT NULL,
      content_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by TEXT,
      action_taken TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status, created_at DESC);
  `);
  // Soft-delete / anonymisation sur users (colonnes ajoutées si absentes).
  try { db.exec('ALTER TABLE users ADD COLUMN deleted_at INTEGER'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE users ADD COLUMN anonymized INTEGER DEFAULT 0'); } catch { /* déjà */ }
  _init = true;
}

/* ============================ BLOCAGE ============================ */

export function blockUser(blockerId: string, blockedId: string): boolean {
  ensure();
  if (!blockerId || !blockedId || blockerId === blockedId) return false;
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO user_blocks (id, blocker_id, blocked_id, created_at) VALUES (?,?,?,?)')
    .run(randomUUID(), blockerId, blockedId, Date.now());
  return true;
}

export function unblockUser(blockerId: string, blockedId: string): boolean {
  ensure();
  const db = getDb();
  db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);
  return true;
}

/** A a-t-il bloqué B ? */
export function hasBlocked(blockerId: string, blockedId: string): boolean {
  ensure();
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').get(blockerId, blockedId);
}

/** Blocage dans un sens OU l'autre (pour couper la messagerie). */
export function isBlockedEither(a: string, b: string): boolean {
  ensure();
  const db = getDb();
  return !!db
    .prepare('SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
    .get(a, b, b, a);
}

/** IDs que `userId` a bloqués OU qui l'ont bloqué (pour filtrer le feed). */
export function blockedRelatedIds(userId: string): string[] {
  ensure();
  const db = getDb();
  const rows = db
    .prepare('SELECT blocked_id AS x FROM user_blocks WHERE blocker_id = ? UNION SELECT blocker_id AS x FROM user_blocks WHERE blocked_id = ?')
    .all(userId, userId) as Array<{ x: string }>;
  return rows.map((r) => r.x);
}

export function listBlockedUsers(blockerId: string): Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null; created_at: number }> {
  ensure();
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, b.created_at
         FROM user_blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    )
    .all(blockerId) as never;
}

/* ============================ SIGNALEMENTS ============================ */

export function reportUser(reporterId: string, reportedUserId: string, reason: ReportReason, description = ''): boolean {
  ensure();
  if (!reportedUserId || reporterId === reportedUserId) return false;
  const db = getDb();
  db.prepare('INSERT INTO user_reports (id, reporter_id, reported_user_id, reason, description, created_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), reporterId, reportedUserId, reason, description.trim().slice(0, 1000), Date.now());
  return true;
}

export function reportContent(reporterId: string, kind: ContentKind, contentId: string, reason: ReportReason, description = ''): boolean {
  ensure();
  if (!contentId) return false;
  const db = getDb();
  db.prepare('INSERT INTO content_reports (id, reporter_id, content_kind, content_id, reason, description, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), reporterId, kind, contentId, reason, description.trim().slice(0, 1000), Date.now());
  return true;
}

export function countPendingReports(): { users: number; content: number } {
  ensure();
  const db = getDb();
  const u = (db.prepare("SELECT COUNT(*) AS c FROM user_reports WHERE status = 'pending'").get() as { c: number }).c;
  const c = (db.prepare("SELECT COUNT(*) AS c FROM content_reports WHERE status = 'pending'").get() as { c: number }).c;
  return { users: u, content: c };
}

/** Admin : signalements en attente (user + contenu), enrichis du pseudo. */
export function listPendingReports(limit = 200) {
  ensure();
  const db = getDb();
  const users = db
    .prepare(
      `SELECT r.*, ru.username AS reporter_username, tu.username AS reported_username, tu.display_name AS reported_display
         FROM user_reports r
         LEFT JOIN users ru ON ru.id = r.reporter_id
         LEFT JOIN users tu ON tu.id = r.reported_user_id
        WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(limit);
  const content = db
    .prepare(
      `SELECT r.*, ru.username AS reporter_username
         FROM content_reports r LEFT JOIN users ru ON ru.id = r.reporter_id
        WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(limit);
  return { users, content };
}

/** Admin : clôt un signalement (resolved | dismissed). */
export function resolveReport(table: 'user' | 'content', reportId: string, reviewerId: string, status: 'resolved' | 'dismissed', actionTaken = ''): boolean {
  ensure();
  const db = getDb();
  const t = table === 'user' ? 'user_reports' : 'content_reports';
  const r = db.prepare(`UPDATE ${t} SET status = ?, reviewed_at = ?, reviewed_by = ?, action_taken = ? WHERE id = ?`)
    .run(status, Date.now(), reviewerId, actionTaken.slice(0, 500), reportId);
  return r.changes > 0;
}

/* ============================ SUPPRESSION DE COMPTE ============================ */

/**
 * Suppression de compte (Apple 5.1.1 — obligatoire et faisable in-app).
 * On ANONYMISE (RGPD : on garde les écritures comptables mais sans PII) :
 *   - PII effacée (username→deleted_<id>, display_name→"Compte supprimé", email/avatar/password→null)
 *   - deleted_at posé, anonymized=1
 *   - TOUTES les sessions supprimées (déconnexion partout)
 *   - contenus soft-delete (posts + direct_cards) → disparaissent des feeds
 *   - amitiés supprimées
 * Retourne true si le compte existait.
 */
export function deleteAccount(userId: string): boolean {
  ensure();
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!exists) return false;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET
         username = 'deleted_' || substr(id,1,8),
         display_name = 'Compte supprimé',
         email = NULL,
         password_hash = NULL,
         avatar_url = NULL,
         deleted_at = ?,
         anonymized = 1
       WHERE id = ?`,
    ).run(now, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    // Soft-delete des contenus (les tables ont deleted_at).
    for (const t of ['posts', 'direct_cards']) {
      try { db.prepare(`UPDATE ${t} SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL`).run(now, userId); } catch { /* schéma */ }
    }
    try { db.prepare('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?').run(userId, userId); } catch { /* */ }
  });
  tx();
  return true;
}
