import 'server-only';

/**
 * Talk2Me — Programme Drive/Transport : profil PORTEUR + KYC CNI (Brique A).
 * Doctrine : docs/MODULE_DISTRIBUTION.md §10. Le gate de tout l'acheminement relais.
 * - Inscription par TÉLÉPHONE (clé d'identité, façon remise "4 derniers chiffres").
 * - CNI obligatoire AVANT de pouvoir porter : numéro chiffré (jamais en clair),
 *   photos recto/verso dans un dossier PRIVÉ (data/cni/, hors web public) — PII air-gap.
 * - Seul un porteur `verified` peut accepter/porter un colis (gate aval).
 */
import { getDb } from '@/lib/db';
import { encryptField, decryptField, maskTail } from '@/lib/secure-field';

export type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type CarrierMode = 'pied' | 'velo' | 'moto' | 'scooter' | 'voiture' | 'taxibrousse';
export const CARRIER_MODES: CarrierMode[] = ['pied', 'velo', 'moto', 'scooter', 'voiture', 'taxibrousse'];

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS transport_profile (
      user_id       TEXT PRIMARY KEY,
      phone         TEXT,
      cni_number_enc TEXT,
      cni_front     TEXT,          -- id opaque fichier privé (data/cni/)
      cni_back      TEXT,
      cni_status    TEXT NOT NULL DEFAULT 'none',
      reject_reason TEXT,
      modes         TEXT,          -- JSON CarrierMode[]
      rating        REAL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      verified_at   INTEGER
    )`);
  // KYC renforcé (Pascal 2026-06-22) : nom (concordance CNI), vidéo liveness, attestation SIM au nom.
  for (const sql of [
    'ALTER TABLE transport_profile ADD COLUMN full_name TEXT',
    'ALTER TABLE transport_profile ADD COLUMN cni_video TEXT',     // id fichier privé (vidéo face+profils)
    'ALTER TABLE transport_profile ADD COLUMN sim_attested INTEGER DEFAULT 0',
  ]) { try { getDb().exec(sql); } catch { /* déjà */ } }
  ensured = true;
}

export interface CarrierProfileView {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  cni_masked: string;        // ex. ••••1234 (jamais le numéro complet hors admin)
  cni_status: CniStatus;
  reject_reason: string | null;
  modes: CarrierMode[];
  rating: number;
  has_photos: boolean;
  has_video: boolean;
  sim_attested: boolean;
}

interface Row {
  user_id: string; full_name: string | null; phone: string | null; cni_number_enc: string | null;
  cni_front: string | null; cni_back: string | null; cni_video: string | null; sim_attested: number;
  cni_status: string; reject_reason: string | null; modes: string | null; rating: number;
  created_at: number; updated_at: number; verified_at: number | null;
}

function toView(r: Row): CarrierProfileView {
  let modes: CarrierMode[] = [];
  try { modes = JSON.parse(r.modes || '[]'); } catch { /* */ }
  return {
    user_id: r.user_id,
    full_name: r.full_name,
    phone: r.phone,
    cni_masked: r.cni_number_enc ? maskTail(decryptField(r.cni_number_enc)) : '',
    cni_status: (r.cni_status as CniStatus) || 'none',
    reject_reason: r.reject_reason,
    modes,
    rating: r.rating || 0,
    has_photos: !!(r.cni_front && r.cni_back),
    has_video: !!r.cni_video,
    sim_attested: !!r.sim_attested,
  };
}

export function getCarrierProfile(userId: string): CarrierProfileView | null {
  ensure();
  const r = getDb().prepare('SELECT * FROM transport_profile WHERE user_id = ?').get(userId) as Row | undefined;
  return r ? toView(r) : null;
}

/** Soumet / met à jour le dossier porteur → repasse en `pending` (re-vérif).
 *  KYC : nom complet (concordance CNI), vidéo liveness (face+profils), attestation SIM au nom. */
export function submitCarrierProfile(userId: string, p: {
  fullName: string; phone: string; cniNumber: string; frontId: string; backId: string; videoId: string; simAttested: boolean; modes: CarrierMode[];
}): CarrierProfileView {
  ensure();
  const now = Date.now();
  const modes = JSON.stringify((p.modes || []).filter((m) => CARRIER_MODES.includes(m)));
  getDb().prepare(`
    INSERT INTO transport_profile (user_id, full_name, phone, cni_number_enc, cni_front, cni_back, cni_video, sim_attested, cni_status, reject_reason, modes, created_at, updated_at, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name=excluded.full_name, phone=excluded.phone, cni_number_enc=excluded.cni_number_enc,
      cni_front=excluded.cni_front, cni_back=excluded.cni_back, cni_video=excluded.cni_video,
      sim_attested=excluded.sim_attested, cni_status='pending', reject_reason=NULL, modes=excluded.modes,
      updated_at=excluded.updated_at, verified_at=NULL
  `).run(userId, p.fullName.trim().slice(0, 120), p.phone.trim().slice(0, 32), encryptField(p.cniNumber.trim()),
    p.frontId, p.backId, p.videoId, p.simAttested ? 1 : 0, modes, now, now);
  return getCarrierProfile(userId)!;
}

/** Gate aval : ce porteur peut-il accepter/porter un colis ? */
export function isVerifiedCarrier(userId: string): boolean {
  ensure();
  const r = getDb().prepare('SELECT cni_status FROM transport_profile WHERE user_id = ?').get(userId) as { cni_status: string } | undefined;
  return r?.cni_status === 'verified';
}

// ── Côté ADMIN (file de vérification CNI) ──

export interface CniReviewItem {
  user_id: string; full_name: string | null; phone: string | null; username: string | null; display_name: string | null;
  cni_number_full: string;   // déchiffré — admin uniquement
  modes: CarrierMode[]; cni_status: CniStatus; sim_attested: boolean; has_video: boolean; submitted_at: number;
}

export function listCniQueue(status: CniStatus = 'pending'): CniReviewItem[] {
  ensure();
  const rows = getDb().prepare(`
    SELECT tp.*, u.username, u.display_name
    FROM transport_profile tp LEFT JOIN users u ON u.id = tp.user_id
    WHERE tp.cni_status = ? ORDER BY tp.updated_at ASC
  `).all(status) as (Row & { username: string | null; display_name: string | null })[];
  return rows.map((r) => {
    let modes: CarrierMode[] = [];
    try { modes = JSON.parse(r.modes || '[]'); } catch { /* */ }
    return {
      user_id: r.user_id, full_name: r.full_name, phone: r.phone, username: r.username, display_name: r.display_name,
      cni_number_full: r.cni_number_enc ? decryptField(r.cni_number_enc) : '',
      modes, cni_status: r.cni_status as CniStatus, sim_attested: !!r.sim_attested, has_video: !!r.cni_video,
      submitted_at: r.updated_at,
    };
  });
}

/** Chemin disque privé d'une pièce CNI / vidéo liveness (admin only). */
export function getCniPhotoId(userId: string, side: 'front' | 'back' | 'video'): string | null {
  ensure();
  const r = getDb().prepare('SELECT cni_front, cni_back, cni_video FROM transport_profile WHERE user_id = ?').get(userId) as { cni_front: string | null; cni_back: string | null; cni_video: string | null } | undefined;
  if (!r) return null;
  return side === 'front' ? r.cni_front : side === 'back' ? r.cni_back : r.cni_video;
}

/** DÉMO uniquement : crée/force un porteur vérifié (pour la démo bout-en-bout). */
export function devForceVerify(userId: string, fullName: string, phone: string): void {
  ensure();
  const now = Date.now();
  getDb().prepare(`INSERT INTO transport_profile (user_id, full_name, phone, cni_status, modes, sim_attested, created_at, updated_at, verified_at)
    VALUES (?,?,?, 'verified', ?, 1, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, phone=excluded.phone, cni_status='verified', verified_at=excluded.verified_at, updated_at=excluded.updated_at`)
    .run(userId, fullName, phone, JSON.stringify(['moto', 'taxibrousse']), now, now, now);
}

export function setCniStatus(userId: string, action: 'verify' | 'reject', reason?: string): boolean {
  ensure();
  const now = Date.now();
  if (action === 'verify') {
    getDb().prepare("UPDATE transport_profile SET cni_status='verified', reject_reason=NULL, verified_at=?, updated_at=? WHERE user_id=?").run(now, now, userId);
  } else {
    getDb().prepare("UPDATE transport_profile SET cni_status='rejected', reject_reason=?, verified_at=NULL, updated_at=? WHERE user_id=?").run((reason || 'Document illisible ou non conforme').slice(0, 200), now, userId);
  }
  return true;
}
