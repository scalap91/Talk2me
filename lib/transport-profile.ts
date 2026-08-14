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
import { VEHICLE_CATS } from '@/lib/drive-vehicles';

export type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type CarrierMode = 'pied' | 'velo' | 'moto' | 'scooter' | 'voiture' | 'taxibrousse';
export const CARRIER_MODES: CarrierMode[] = ['pied', 'velo', 'moto', 'scooter', 'voiture', 'taxibrousse'];
// Vocabulaire véhicule UNIQUE = VEHICLE_CATS (Pascal 2026-08-10) : le fleet accepte ces clés
// (tuktuk/taxi/camionnette inclus). CARRIER_MODES ne sert plus qu'au champ legacy `modes`.
const FLEET_TYPES = new Set<string>(VEHICLE_CATS.map((v) => v.key));
/** Un véhicule de la flotte d'un transporteur. `type` = clé VEHICLE_CATS. */
export interface Vehicle { type: string; label?: string; plate?: string; capacity_kg?: number; }
/** Dépôt/entrepôt du transporteur (Mada : épingle GPS + point de repère, pas d'adresse rue). */
export interface Depot { lat: number; lng: number; label: string | null; }

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
    // DÉPÔT + FLOTTE (Pascal 2026-07-24) — réutilisés par la boutique (retrait au dépôt, matching livraison).
    'ALTER TABLE transport_profile ADD COLUMN depot_lat REAL',
    'ALTER TABLE transport_profile ADD COLUMN depot_lng REAL',
    'ALTER TABLE transport_profile ADD COLUMN depot_label TEXT',   // adresse/point de repère du dépôt (Mada : pin + repère)
    'ALTER TABLE transport_profile ADD COLUMN fleet TEXT',          // JSON Vehicle[] (véhicules de la flotte)
    // TARIFS AGENCE (Pascal 2026-07-26) — l'agence fixe ses prix ; sert la boutique (retrait/livraison)
    // ET l'envoi de colis/courrier P2P (particulier → agence → destinataire). MGA (Ariary).
    'ALTER TABLE transport_profile ADD COLUMN price_base_cents INTEGER',    // prise en charge (forfait de départ)
    'ALTER TABLE transport_profile ADD COLUMN price_per_km_cents INTEGER',  // au km
    'ALTER TABLE transport_profile ADD COLUMN accepts_parcels INTEGER DEFAULT 0', // accepte les colis de particuliers (P2P)
    'ALTER TABLE transport_profile ADD COLUMN cni_selfie TEXT', // photo visage prise EN DIRECT à la caméra (vérif cam, léger)
    // PASSER EN AGENCE (Pascal 2026-07-26) : pièces société. RCS + NIF obligatoires ; Statuts + STAT optionnels.
    'ALTER TABLE transport_profile ADD COLUMN doc_rcs TEXT',     // extrait Registre du Commerce (obligatoire)
    'ALTER TABLE transport_profile ADD COLUMN doc_nif TEXT',     // carte d\'immatriculation fiscale / NIF (obligatoire)
    'ALTER TABLE transport_profile ADD COLUMN doc_statuts TEXT', // statuts de la société (optionnel)
    'ALTER TABLE transport_profile ADD COLUMN doc_stat TEXT',    // carte statistique (optionnel)
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
  depot: Depot | null;   // entrepôt du transporteur (retrait boutique + point d'origine livraison)
  fleet: Vehicle[];      // véhicules déclarés
  pricing: { base_cents: number; per_km_cents: number } | null; // tarifs déclarés (agence)
  accepts_parcels: boolean; // accepte les colis/courrier de particuliers (P2P)
  docs: { rcs: boolean; nif: boolean; statuts: boolean; stat: boolean }; // pièces société fournies (booléens, jamais les ids)
}

interface Row {
  user_id: string; full_name: string | null; phone: string | null; cni_number_enc: string | null;
  cni_front: string | null; cni_back: string | null; cni_video: string | null; sim_attested: number;
  cni_status: string; reject_reason: string | null; modes: string | null; rating: number;
  depot_lat: number | null; depot_lng: number | null; depot_label: string | null; fleet: string | null;
  price_base_cents: number | null; price_per_km_cents: number | null; accepts_parcels: number | null;
  doc_rcs: string | null; doc_nif: string | null; doc_statuts: string | null; doc_stat: string | null;
  created_at: number; updated_at: number; verified_at: number | null;
}

function toView(r: Row): CarrierProfileView {
  let modes: CarrierMode[] = [];
  try { modes = JSON.parse(r.modes || '[]'); } catch { /* */ }
  let fleet: Vehicle[] = [];
  try { fleet = JSON.parse(r.fleet || '[]'); } catch { /* */ }
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
    depot: (r.depot_lat != null && r.depot_lng != null) ? { lat: r.depot_lat, lng: r.depot_lng, label: r.depot_label } : null,
    fleet,
    pricing: (r.price_base_cents != null || r.price_per_km_cents != null) ? { base_cents: r.price_base_cents || 0, per_km_cents: r.price_per_km_cents || 0 } : null,
    accepts_parcels: !!r.accepts_parcels,
    docs: { rcs: !!r.doc_rcs, nif: !!r.doc_nif, statuts: !!r.doc_statuts, stat: !!r.doc_stat },
  };
}

export function getCarrierProfile(userId: string): CarrierProfileView | null {
  ensure();
  const r = getDb().prepare('SELECT * FROM transport_profile WHERE user_id = ?').get(userId) as Row | undefined;
  return r ? toView(r) : null;
}

/** DÉPÔT + FLOTTE du transporteur (Phase 1). Indépendant du KYC — un porteur déclare son entrepôt
 *  (pin GPS + repère, Mada-first) et ses véhicules. Réutilisé par la boutique : retrait au dépôt +
 *  point d'origine des livraisons + matching. Passer `depot:null` efface le dépôt. */
export function setCarrierLogistics(userId: string, p: {
  depot?: { lat: number; lng: number; label?: string } | null;
  fleet?: Vehicle[];
  pricing?: { base_cents: number; per_km_cents: number } | null;
  acceptsParcels?: boolean;
  docs?: { rcs?: string; nif?: string; statuts?: string; stat?: string }; // ids fichiers (upload) — mis à jour si fournis
}): CarrierProfileView | null {
  ensure();
  const now = Date.now();
  // Le profil peut ne pas encore exister (dépôt déclarable avant KYC complet).
  getDb().prepare(`INSERT INTO transport_profile (user_id, cni_status, created_at, updated_at)
    VALUES (?, 'none', ?, ?) ON CONFLICT(user_id) DO NOTHING`).run(userId, now, now);
  if (p.depot !== undefined) {
    if (p.depot && Number.isFinite(p.depot.lat) && Number.isFinite(p.depot.lng)) {
      getDb().prepare('UPDATE transport_profile SET depot_lat=?, depot_lng=?, depot_label=?, updated_at=? WHERE user_id=?')
        .run(p.depot.lat, p.depot.lng, (p.depot.label || '').slice(0, 200) || null, now, userId);
    } else {
      getDb().prepare('UPDATE transport_profile SET depot_lat=NULL, depot_lng=NULL, depot_label=NULL, updated_at=? WHERE user_id=?').run(now, userId);
    }
  }
  if (p.fleet !== undefined) {
    const clean = (p.fleet || [])
      .filter((v) => v && FLEET_TYPES.has(v.type))
      .slice(0, 20)
      .map((v) => ({ type: v.type, label: (v.label || '').slice(0, 60), plate: (v.plate || '').slice(0, 20),
                     capacity_kg: Number(v.capacity_kg) > 0 ? Math.round(Number(v.capacity_kg)) : undefined }));
    getDb().prepare('UPDATE transport_profile SET fleet=?, updated_at=? WHERE user_id=?').run(JSON.stringify(clean), now, userId);
  }
  if (p.pricing !== undefined) {
    if (p.pricing) {
      const base = Math.max(0, Math.round(p.pricing.base_cents || 0));
      const perKm = Math.max(0, Math.round(p.pricing.per_km_cents || 0));
      getDb().prepare('UPDATE transport_profile SET price_base_cents=?, price_per_km_cents=?, updated_at=? WHERE user_id=?').run(base, perKm, now, userId);
    } else {
      getDb().prepare('UPDATE transport_profile SET price_base_cents=NULL, price_per_km_cents=NULL, updated_at=? WHERE user_id=?').run(now, userId);
    }
  }
  if (p.acceptsParcels !== undefined) {
    getDb().prepare('UPDATE transport_profile SET accepts_parcels=?, updated_at=? WHERE user_id=?').run(p.acceptsParcels ? 1 : 0, now, userId);
  }
  if (p.docs) { // n'écrase QUE les documents fournis (upload) ; les autres restent
    const d = p.docs;
    if (d.rcs) getDb().prepare('UPDATE transport_profile SET doc_rcs=?, updated_at=? WHERE user_id=?').run(d.rcs, now, userId);
    if (d.nif) getDb().prepare('UPDATE transport_profile SET doc_nif=?, updated_at=? WHERE user_id=?').run(d.nif, now, userId);
    if (d.statuts) getDb().prepare('UPDATE transport_profile SET doc_statuts=?, updated_at=? WHERE user_id=?').run(d.statuts, now, userId);
    if (d.stat) getDb().prepare('UPDATE transport_profile SET doc_stat=?, updated_at=? WHERE user_id=?').run(d.stat, now, userId);
  }
  return getCarrierProfile(userId);
}

/** Soumet / met à jour le dossier porteur → repasse en `pending` (re-vérif).
 *  KYC : nom complet (concordance CNI), vidéo liveness (face+profils), attestation SIM au nom. */
export function submitCarrierProfile(userId: string, p: {
  fullName: string; phone: string; cniNumber: string; frontId: string; backId: string; videoId: string; selfieId?: string; simAttested: boolean; modes: CarrierMode[];
}): CarrierProfileView {
  ensure();
  const now = Date.now();
  const modes = JSON.stringify((p.modes || []).filter((m) => CARRIER_MODES.includes(m)));
  getDb().prepare(`
    INSERT INTO transport_profile (user_id, full_name, phone, cni_number_enc, cni_front, cni_back, cni_video, cni_selfie, sim_attested, cni_status, reject_reason, modes, created_at, updated_at, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name=excluded.full_name, phone=excluded.phone, cni_number_enc=excluded.cni_number_enc,
      cni_front=excluded.cni_front, cni_back=excluded.cni_back, cni_video=excluded.cni_video, cni_selfie=excluded.cni_selfie,
      sim_attested=excluded.sim_attested, cni_status='pending', reject_reason=NULL, modes=excluded.modes,
      updated_at=excluded.updated_at, verified_at=NULL
  `).run(userId, p.fullName.trim().slice(0, 120), p.phone.trim().slice(0, 32), encryptField(p.cniNumber.trim()),
    p.frontId, p.backId, p.videoId, p.selfieId || null, p.simAttested ? 1 : 0, modes, now, now);
  return getCarrierProfile(userId)!;
}

/** Gate aval : ce porteur peut-il accepter/porter un colis ? */
export function isVerifiedCarrier(userId: string): boolean {
  ensure();
  const r = getDb().prepare('SELECT cni_status FROM transport_profile WHERE user_id = ?').get(userId) as { cni_status: string } | undefined;
  return r?.cni_status === 'verified';
}

/**
 * Phase 4b-3 — gate PRENDRE UNE MISSION (course déménagement/encombrants/passager/colis P2P) :
 * CNI vérifiée + ≥1 véhicule déclaré (doctrine « conduire = déclarer ses véhicules »).
 * Renvoie une raison actionnable pour renvoyer l'UI vers Mon Compte (CNI) ou Ma flotte.
 */
export function missionGate(userId: string): { ok: boolean; reason?: 'cni' | 'vehicle' } {
  ensure();
  const r = getDb().prepare('SELECT cni_status, fleet FROM transport_profile WHERE user_id = ?').get(userId) as { cni_status: string; fleet: string | null } | undefined;
  if (!r || r.cni_status !== 'verified') return { ok: false, reason: 'cni' };
  let fleet: unknown[] = [];
  try { fleet = JSON.parse(r.fleet || '[]'); } catch { /* */ }
  if (!Array.isArray(fleet) || fleet.length < 1) return { ok: false, reason: 'vehicle' };
  return { ok: true };
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
