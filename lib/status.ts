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

/** Diffuse une boutique/plat dans la story (kind 'shop'), 1 SEULE story active par shop :
 *  si une story non expirée existe déjà pour ce shop → on la met à jour (média + fraîcheur),
 *  sinon on la crée. Évite le spam quand la vitrine se republie à chaque changement d'article. */
export function upsertShopStatus(ownerId: string, shopId: string, mediaUrl: string | null, caption: string | null): Status {
  ensure();
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM statuses WHERE owner_id = ? AND shop_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .get(ownerId, shopId, now) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE statuses SET media_url = ?, caption = ?, created_at = ?, expires_at = ? WHERE id = ?')
      .run(mediaUrl || null, (caption || '').slice(0, 200) || null, now, now + TTL, existing.id);
    return db.prepare('SELECT * FROM statuses WHERE id = ?').get(existing.id) as Status;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO statuses (id, owner_id, kind, media_url, shop_id, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, 'shop', mediaUrl || null, shopId, (caption || '').slice(0, 200) || null, now, now + TTL);
  return db.prepare('SELECT * FROM statuses WHERE id = ?').get(id) as Status;
}

/** Statuts NON expirés de l'user + de ses contacts, groupés par propriétaire.
 *  + Stories de BOUTIQUE/PLAT visibles dans un rayon de 500 m de la position du viewer
 *    (économie de proximité, Pascal 2026-06-20), même si l'owner n'est pas un ami. */
export interface StatusGroup { owner_id: string; username: string; display_name: string | null; avatar_url: string | null; preview: string | null; count: number; last_at: number; mine: boolean; nearby?: boolean }
const NEARBY_RADIUS_M = 500;
type RawGroup = { owner_id: string; count: number; last_at: number; username: string; display_name: string | null; avatar_url: string | null };

export function getStatusFeed(userId: string, friendIds: string[], viewer?: { lat?: number | null; lng?: number | null }): StatusGroup[] {
  ensure();
  const db = getDb();
  purgeExpiredStatuses();
  const now = Date.now();
  const owners = [userId, ...friendIds.filter((x) => x && x !== userId)];

  // 1) Stories de moi + mes amis (tous types).
  const ph = owners.map(() => '?').join(',');
  const rows: RawGroup[] = owners.length ? db.prepare(
    `SELECT s.owner_id, COUNT(*) AS count, MAX(s.created_at) AS last_at, u.username, u.display_name, u.avatar_url
       FROM statuses s JOIN users u ON u.id = s.owner_id
      WHERE s.owner_id IN (${ph}) AND s.expires_at > ? GROUP BY s.owner_id ORDER BY last_at DESC`
  ).all(...owners, now) as RawGroup[] : [];

  // 2) Stories de boutique/plat à proximité (≤ 500 m), owners NON déjà inclus.
  const nearbyOwners = new Set<string>();
  if (viewer && viewer.lat != null && viewer.lng != null) {
    const shopStatuses = db.prepare(
      `SELECT st.owner_id, MAX(st.created_at) AS last_at, COUNT(*) AS count,
              u.username, u.display_name, u.avatar_url, sh.lat, sh.lng
         FROM statuses st
         JOIN (SELECT id,lat,lng FROM boutiques_perso
               UNION ALL SELECT id,lat,lng FROM plats_maison
               UNION ALL SELECT id,lat,lng FROM eat_shops) sh ON sh.id = st.shop_id
         JOIN users u ON u.id = st.owner_id
        WHERE st.kind = 'shop' AND st.expires_at > ? AND sh.lat IS NOT NULL AND sh.lng IS NOT NULL
        GROUP BY st.owner_id, sh.lat, sh.lng`
    ).all(now) as (RawGroup & { lat: number; lng: number })[];
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    for (const s of shopStatuses) {
      if (owners.includes(s.owner_id)) continue; // déjà couvert par les amis
      const dLat = toRad(s.lat - viewer.lat), dLng = toRad(s.lng - viewer.lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(viewer.lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      if (dist <= NEARBY_RADIUS_M) { nearbyOwners.add(s.owner_id); rows.push(s); }
    }
  }

  // Miniature = dernière story (image ; boutique → 1re photo article réelle).
  const lastStmt = db.prepare('SELECT kind, media_url, shop_id FROM statuses WHERE owner_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1');
  const itemStmt = db.prepare(
    `SELECT image_url FROM (SELECT image_url, position, shop_id FROM boutique_items
       UNION ALL SELECT image_url, position, shop_id FROM plat_items
       UNION ALL SELECT image_url, position, shop_id FROM eat_items) WHERE shop_id = ? ORDER BY position ASC LIMIT 1`
  );
  return rows.map((r) => {
    const last = lastStmt.get(r.owner_id, now) as { kind: string; media_url: string | null; shop_id: string | null } | undefined;
    let preview = last?.media_url ?? null;
    if (!preview && last?.shop_id) preview = (itemStmt.get(last.shop_id) as { image_url?: string } | undefined)?.image_url ?? null;
    return {
      owner_id: r.owner_id, username: r.username, display_name: r.display_name,
      avatar_url: r.avatar_url ?? null, preview, count: r.count, last_at: r.last_at,
      mine: r.owner_id === userId, nearby: nearbyOwners.has(r.owner_id),
    };
  }).sort((a, b) => b.last_at - a.last_at);
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
