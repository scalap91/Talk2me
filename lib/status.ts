'use server-only';

/**
 * Talk2Me — STATUT façon WhatsApp (Pascal 2026-06-09). Une rangée de statuts en
 * haut de la liste Amis : "Ajouter un statut" + ceux de tes contacts. Éphémère
 * (24 h). Un statut peut être une image, une vidéo, ou UNE BOUTIQUE (le vendeur
 * met son catalogue en statut → ses contacts le voient). Tap → plein écran.
 */

import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

const TTL = 24 * 60 * 60 * 1000;
let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,            -- 'image' | 'video' | 'shop'
      media_url TEXT,
      shop_id TEXT,
      caption TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_status_owner ON statuses(owner_id);
    CREATE INDEX IF NOT EXISTS idx_status_exp ON statuses(expires_at);
  `);
  ensured = true;
}

export interface Status { id: string; owner_id: string; kind: string; media_url: string | null; shop_id: string | null; caption: string | null; created_at: number; expires_at: number }

/** Supprime les statuts expirés (>24 h). Appelé en cron + en lecture (paresseux). */
export function purgeExpiredStatuses(): number {
  ensure();
  const info = getDb().prepare('DELETE FROM statuses WHERE expires_at < ?').run(Date.now());
  return info.changes as number;
}

export function createStatus(ownerId: string, s: { kind: 'image' | 'video' | 'shop'; media_url?: string | null; shop_id?: string | null; caption?: string | null }): Status {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare('INSERT INTO statuses (id, owner_id, kind, media_url, shop_id, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, s.kind, s.media_url || null, s.shop_id || null, (s.caption || '').slice(0, 200) || null, now, now + TTL);
  return getDb().prepare('SELECT * FROM statuses WHERE id = ?').get(id) as Status;
}

/** Statuts NON expirés de l'user + de ses contacts, groupés par propriétaire. */
export interface StatusGroup { owner_id: string; username: string; display_name: string | null; avatar_url: string | null; preview: string | null; count: number; last_at: number; mine: boolean }
export function getStatusFeed(userId: string, friendIds: string[]): StatusGroup[] {
  ensure();
  const db = getDb();
  purgeExpiredStatuses(); // purge paresseuse à chaque consultation
  const owners = [userId, ...friendIds.filter((x) => x && x !== userId)];
  if (owners.length === 0) return [];
  const now = Date.now();
  const ph = owners.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT s.owner_id, COUNT(*) AS count, MAX(s.created_at) AS last_at,
            u.username, u.display_name, u.avatar_url
       FROM statuses s JOIN users u ON u.id = s.owner_id
      WHERE s.owner_id IN (${ph}) AND s.expires_at > ?
      GROUP BY s.owner_id
      ORDER BY last_at DESC`
  ).all(...owners, now) as { owner_id: string; count: number; last_at: number; username: string; display_name: string | null; avatar_url: string | null }[];

  // Miniature = le dernier statut (son image ; pour une boutique → 1re photo article).
  const lastStmt = db.prepare('SELECT kind, media_url, shop_id FROM statuses WHERE owner_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1');
  const itemStmt = db.prepare('SELECT image_url FROM simple_shop_items WHERE shop_id = ? ORDER BY position ASC LIMIT 1');
  return rows.map((r) => {
    const last = lastStmt.get(r.owner_id, now) as { kind: string; media_url: string | null; shop_id: string | null } | undefined;
    let preview = last?.media_url ?? null;
    if (!preview && last?.shop_id) preview = (itemStmt.get(last.shop_id) as { image_url?: string } | undefined)?.image_url ?? null;
    return {
      owner_id: r.owner_id, username: r.username, display_name: r.display_name,
      avatar_url: r.avatar_url ?? null, preview, count: r.count, last_at: r.last_at, mine: r.owner_id === userId,
    };
  });
}

/** Supprime UN statut (le propriétaire retire sa story). */
export function deleteStatus(ownerId: string, statusId: string): void {
  ensure();
  getDb().prepare('DELETE FROM statuses WHERE id = ? AND owner_id = ?').run(statusId, ownerId);
}

/** Statuts d'un propriétaire (pour le viewer plein écran). */
export function getOwnerStatuses(ownerId: string): Status[] {
  ensure();
  return getDb().prepare('SELECT * FROM statuses WHERE owner_id = ? AND expires_at > ? ORDER BY created_at ASC')
    .all(ownerId, Date.now()) as Status[];
}
