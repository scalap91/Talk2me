/**
 * RATTACHEMENT DES CHAUFFEURS À UNE AGENCE (Pascal 2026-07-26).
 * L'agence attache un chauffeur (par n° de téléphone / identifiant / QR — le QR encode le même n°),
 * puis le chauffeur VALIDE son rattachement (double consentement). Rien n'est actif sans l'accord des deux.
 * Table `agency_drivers` : une ligne par (agence, chauffeur), statut pending → active / rejected.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendPushToUser } from '@/lib/push';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS agency_drivers (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'rejected'
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(agency_id, driver_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agdrv_agency ON agency_drivers(agency_id, status);
    CREATE INDEX IF NOT EXISTS idx_agdrv_driver ON agency_drivers(driver_id, status);
  `);
  ensured = true;
}

function findUserByPhone(phone: string): { id: string; name: string } | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  // Match sur les derniers chiffres (formats +261 / 0xx variés à Mada).
  const r = getDb().prepare("SELECT id, COALESCE(display_name, username) AS name FROM users WHERE REPLACE(REPLACE(phone,' ',''),'+','') LIKE ?")
    .get('%' + digits.slice(-9)) as { id: string; name: string | null } | undefined;
  return r ? { id: r.id, name: r.name || 'Chauffeur' } : null;
}

/** L'AGENCE attache un chauffeur par téléphone → crée une demande 'pending' + notifie le chauffeur. */
export function attachDriverByPhone(agencyId: string, phone: string): { ok: boolean; error?: string; driver?: { id: string; name: string } } {
  const u = findUserByPhone(phone);
  if (!u) return { ok: false, error: 'driver_not_found' };
  return attachDriver(agencyId, u.id);
}

/** L'AGENCE attache un chauffeur par son ID (sélectionné dans la recherche type-ahead amis/nom/tél). */
export function attachDriver(agencyId: string, driverId: string): { ok: boolean; error?: string; driver?: { id: string; name: string } } {
  ensure();
  const u = getDb().prepare('SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id=?').get(driverId) as { id: string; name: string | null } | undefined;
  if (!u) return { ok: false, error: 'driver_not_found' };
  if (u.id === agencyId) return { ok: false, error: 'cannot_attach_self' };
  const driver = { id: u.id, name: u.name || 'Chauffeur' };
  const now = Date.now();
  const existing = getDb().prepare('SELECT id, status FROM agency_drivers WHERE agency_id=? AND driver_id=?').get(agencyId, u.id) as { id: string; status: string } | undefined;
  if (existing) {
    if (existing.status === 'active') return { ok: false, error: 'already_attached' };
    getDb().prepare("UPDATE agency_drivers SET status='pending', updated_at=? WHERE id=?").run(now, existing.id); // relance
  } else {
    getDb().prepare('INSERT INTO agency_drivers (id, agency_id, driver_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), agencyId, u.id, 'pending', now, now);
  }
  const ag = getDb().prepare('SELECT COALESCE(display_name, username) AS name FROM users WHERE id=?').get(agencyId) as { name: string | null } | undefined;
  sendPushToUser(u.id, { title: '🚚 Rattachement agence', body: `${ag?.name || 'Une agence'} veut te rattacher comme chauffeur. Valide dans Drive → Chauffeur → Rattachements.`, url: '/drive?rattach=1' }).catch(() => {});
  return { ok: true, driver };
}

/** LE CHAUFFEUR valide (ou refuse) son rattachement. Seul le chauffeur concerné peut répondre. */
export function respondAttachment(driverId: string, attachmentId: string, accept: boolean): { ok: boolean; error?: string } {
  ensure();
  const row = getDb().prepare('SELECT id, agency_id, driver_id, status FROM agency_drivers WHERE id=?').get(attachmentId) as { id: string; agency_id: string; driver_id: string; status: string } | undefined;
  if (!row) return { ok: false, error: 'not_found' };
  if (row.driver_id !== driverId) return { ok: false, error: 'not_your_request' };
  if (row.status !== 'pending') return { ok: false, error: 'already_answered' };
  getDb().prepare('UPDATE agency_drivers SET status=?, updated_at=? WHERE id=?').run(accept ? 'active' : 'rejected', Date.now(), row.id);
  const drv = getDb().prepare('SELECT COALESCE(display_name, username) AS name FROM users WHERE id=?').get(driverId) as { name: string | null } | undefined;
  sendPushToUser(row.agency_id, { title: accept ? '✅ Chauffeur rattaché' : '✗ Rattachement refusé', body: `${drv?.name || 'Le chauffeur'} a ${accept ? 'accepté' : 'refusé'} le rattachement.`, url: '/drive?agency=1' }).catch(() => {});
  return { ok: true };
}

/** L'agence retire un chauffeur. */
export function detachDriver(agencyId: string, driverId: string): { ok: boolean } {
  ensure();
  getDb().prepare('DELETE FROM agency_drivers WHERE agency_id=? AND driver_id=?').run(agencyId, driverId);
  return { ok: true };
}

/** Les chauffeurs d'une agence (pending + active) — avec leur photo. */
export function listAgencyDrivers(agencyId: string): { id: string; driver_id: string; name: string; avatar: string | null; status: string }[] {
  ensure();
  return getDb().prepare(`
    SELECT ad.id, ad.driver_id, ad.status, COALESCE(u.display_name, u.username) AS name, u.avatar_url AS avatar
    FROM agency_drivers ad JOIN users u ON u.id = ad.driver_id
    WHERE ad.agency_id=? AND ad.status IN ('pending','active') ORDER BY ad.updated_at DESC
  `).all(agencyId) as { id: string; driver_id: string; name: string; avatar: string | null; status: string }[];
}

/** Les demandes de rattachement EN ATTENTE pour un chauffeur (à valider). */
export function listMyAttachRequests(driverId: string): { id: string; agency_id: string; agency_name: string }[] {
  ensure();
  return getDb().prepare(`
    SELECT ad.id, ad.agency_id, COALESCE(u.display_name, u.username) AS agency_name
    FROM agency_drivers ad JOIN users u ON u.id = ad.agency_id
    WHERE ad.driver_id=? AND ad.status='pending' ORDER BY ad.created_at DESC
  `).all(driverId) as { id: string; agency_id: string; agency_name: string }[];
}

/** Ce chauffeur est-il rattaché (actif) à cette agence ? (gate aval : l'agence peut lui confier un colis). */
export function isDriverOfAgency(agencyId: string, driverId: string): boolean {
  ensure();
  return !!getDb().prepare("SELECT 1 FROM agency_drivers WHERE agency_id=? AND driver_id=? AND status='active'").get(agencyId, driverId);
}
