/**
 * Talk2Me — Salon (profil Rencontre enrichi).
 * Le profil EST un shop `rencontre` (lib/simple-shop) ; ses ITEMS = la galerie :
 *   - photo/vidéo GRATUITE  = price_cents 0
 *   - photo/vidéo PAYANTE 🔒 = price_cents > 0  (déverrouillage à l'achat)
 *   - attributes.media = 'video' pour une vidéo (sinon photo). image_url = l'URL du média.
 *
 * Deux rails d'accès, calqués sur live_entry (lib/live/session.ts) :
 *   - content_unlocks(item_id, viewer_id) : le visiteur a payé CE contenu → accès.
 *   - salon_vip(owner_id, viewer_id)       : l'hôte a rendu ce visiteur VIP → accès GRATUIT
 *                                            à TOUT son contenu + son live (octroi 1 clic).
 * Octroi à la confirmation du paiement (lib/payments.ts markIntentPaid, orderType 'content_unlock').
 */
import { getDb } from '@/lib/db-core';

let ready = false;
function ensure(): void {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS content_unlocks (
      item_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      seller_id TEXT,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, viewer_id)
    );
    CREATE TABLE IF NOT EXISTS salon_vip (
      owner_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, viewer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_salon_vip_owner ON salon_vip(owner_id);
    CREATE TABLE IF NOT EXISTS live_sale_videos (
      host_user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (host_user_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_sale_host ON live_sale_videos(host_user_id);
  `);
  ready = true;
}

// ── Vidéos payantes mises « à vendre » dans la salle live (Pascal 2026-07-15) ──
// L'hôte coche une vidéo payante de son salon → elle apparaît à l'achat pendant SON live.
// Achat = même rail content_unlock (escrow + commission) → puis la vidéo se regarde.
export function setLiveSaleVideo(hostUserId: string, itemId: string, on: boolean): void {
  ensure();
  if (on) getDb().prepare('INSERT OR IGNORE INTO live_sale_videos (host_user_id, item_id, added_at) VALUES (?, ?, ?)').run(hostUserId, itemId, Date.now());
  else getDb().prepare('DELETE FROM live_sale_videos WHERE host_user_id = ? AND item_id = ?').run(hostUserId, itemId);
}

export function isLiveSaleVideo(hostUserId: string, itemId: string): boolean {
  ensure();
  return !!getDb().prepare('SELECT 1 FROM live_sale_videos WHERE host_user_id = ? AND item_id = ?').get(hostUserId, itemId);
}

/** Les item_ids des vidéos que l'hôte vend actuellement dans son live. */
export function listLiveSaleVideoIds(hostUserId: string): string[] {
  ensure();
  return (getDb().prepare('SELECT item_id FROM live_sale_videos WHERE host_user_id = ? ORDER BY added_at').all(hostUserId) as Array<{ item_id: string }>).map((r) => r.item_id);
}

/** Suppression d'un profil/salon : on efface toutes ses traces de monétisation (pas de code/donnée mort). */
export function purgeSalonForOwner(ownerId: string, itemIds: string[]): void {
  ensure();
  const db = getDb();
  db.prepare('DELETE FROM live_sale_videos WHERE host_user_id = ?').run(ownerId);
  db.prepare('DELETE FROM salon_vip WHERE owner_id = ?').run(ownerId);
  for (const it of itemIds) db.prepare('DELETE FROM content_unlocks WHERE item_id = ?').run(it);
}

/** Le visiteur a-t-il déverrouillé (payé) ce contenu précis ? */
export function hasContentUnlock(itemId: string, viewerId: string): boolean {
  ensure();
  return !!getDb().prepare('SELECT 1 FROM content_unlocks WHERE item_id = ? AND viewer_id = ?').get(itemId, viewerId);
}

/** Octroie l'accès à un contenu payant (après paiement confirmé). Idempotent. */
export function grantContentUnlock(itemId: string, viewerId: string, sellerId: string): void {
  ensure();
  getDb().prepare('INSERT OR IGNORE INTO content_unlocks (item_id, viewer_id, seller_id, granted_at) VALUES (?, ?, ?, ?)')
    .run(itemId, viewerId, sellerId, Date.now());
}

/** VIP = l'hôte a offert l'accès gratuit total à ce visiteur (1 clic). */
export function isVip(ownerId: string, viewerId: string): boolean {
  if (!ownerId || !viewerId) return false;
  ensure();
  return !!getDb().prepare('SELECT 1 FROM salon_vip WHERE owner_id = ? AND viewer_id = ?').get(ownerId, viewerId);
}

export function grantVip(ownerId: string, viewerId: string): void {
  ensure();
  getDb().prepare('INSERT OR IGNORE INTO salon_vip (owner_id, viewer_id, granted_at) VALUES (?, ?, ?)')
    .run(ownerId, viewerId, Date.now());
}

export function revokeVip(ownerId: string, viewerId: string): void {
  ensure();
  getDb().prepare('DELETE FROM salon_vip WHERE owner_id = ? AND viewer_id = ?').run(ownerId, viewerId);
}
