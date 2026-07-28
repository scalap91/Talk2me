import 'server-only';

/**
 * Talk2Me — Acheminement relais multi-tronçons (Brique B).
 * Doctrine docs/MODULE_DISTRIBUTION.md §10. Standards track & trace adaptés Mada :
 *  - bon de transport + n° de tracking
 *  - trajets déclarés (porteurs vérifiés CNI) + matching A→B opportuniste
 *  - relais dynamique : on ajoute un tronçon à chaque fois qu'un porteur couvre une partie
 *  - garde (custody) = TOUJOURS une personne, jamais un lieu (main-à-main)
 *  - remise par 4 derniers chiffres du téléphone (POD/OTP façon Yango)
 *  - événements append-only (l'itinéraire = la suite d'événements ; on n'écrase jamais)
 * Paiement (escrow) = Brique D. Watchdog/exceptions = Brique C.
 */
import { getDb } from '@/lib/db';
import { isVerifiedCarrier, setCniStatus } from '@/lib/transport-profile';
import { getEscrow, releaseEscrow, reassignEscrowPart } from '@/lib/escrow';
import { sendPushToUser } from '@/lib/push';
import { isDriverOfAgency } from '@/lib/agency-drivers';
import { notifyTelegram } from '@/lib/ai-ops/telegram';
import { randomUUID } from 'crypto';

// Watchdog (Brique C) : seuils.
const STALL_MS = 20 * 60_000;     // 20 min sans bouger en route → niveau 1 "à l'arrêt ?"
const ETA_GRACE_MS = 30 * 60_000; // ETA dépassée de 30 min → idem
const DENOUNCE_MS = 60 * 60_000;  // flaggé depuis 1h SANS dénouement → niveau 2 : dénonciation
const DEFAULT_SUSPEND_AT = 3;     // manquements cumulés → suspension auto du porteur
const APPROACH_KM = 0.4;          // porteur à < 400 m du point d'arrivée → "en approche" (notif + pop-up)

export type TripMode = 'pied' | 'velo' | 'moto' | 'scooter' | 'voiture' | 'taxibrousse';
export type ShipmentStatus = 'created' | 'at_depot' | 'in_transit' | 'delivered' | 'cancelled' | 'ready_for_pickup';
export type LegStatus = 'assigned' | 'picked' | 'enroute' | 'done';

let ensured = false;
function ensure() {
  if (ensured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, carrier_id TEXT NOT NULL,
      o_lat REAL, o_lng REAL, o_label TEXT,
      d_lat REAL, d_lng REAL, d_label TEXT,
      depart_at INTEGER, duration_min INTEGER, mode TEXT,
      status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY, tracking TEXT UNIQUE NOT NULL,
      order_id TEXT, product_label TEXT,
      seller_id TEXT NOT NULL, buyer_id TEXT,
      o_lat REAL, o_lng REAL, o_label TEXT,
      d_lat REAL, d_lng REAL, d_label TEXT,
      parcel_size TEXT, parcel_weight TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      custody_user_id TEXT,            -- qui détient le colis MAINTENANT (jamais un lieu)
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shipment_legs (
      id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, seq INTEGER NOT NULL,
      carrier_id TEXT, mode TEXT,
      from_lat REAL, from_lng REAL, from_label TEXT,
      to_lat REAL, to_lng REAL, to_label TEXT,
      status TEXT NOT NULL DEFAULT 'assigned',
      depart_at INTEGER, eta INTEGER,
      last_lat REAL, last_lng REAL, last_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shipment_events (
      id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, leg_seq INTEGER,
      type TEXT NOT NULL, actor_id TEXT, lat REAL, lng REAL, meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ship ON shipment_events(shipment_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_legs_ship ON shipment_legs(shipment_id, seq);
    CREATE INDEX IF NOT EXISTS idx_trips_open ON trips(status, depart_at);
  `);
  // Brique C — colonnes exception/watchdog (migrations idempotentes).
  for (const sql of [
    'ALTER TABLE shipment_legs ADD COLUMN stalled INTEGER DEFAULT 0',
    'ALTER TABLE shipment_legs ADD COLUMN stalled_at INTEGER',
    'ALTER TABLE shipment_legs ADD COLUMN denounced INTEGER DEFAULT 0',
    'ALTER TABLE shipment_legs ADD COLUMN approaching INTEGER DEFAULT 0',
    'ALTER TABLE shipments ADD COLUMN alert TEXT',
    'ALTER TABLE shipments ADD COLUMN amount INTEGER DEFAULT 0', // montant total (produit+portage), Ariary
    'ALTER TABLE shipments ADD COLUMN paid INTEGER DEFAULT 0',
    'ALTER TABLE shipments ADD COLUMN escrow_id TEXT', // escrow RÉEL lié (commande boutique) → release à la livraison
    'ALTER TABLE shipments ADD COLUMN cur_lat REAL',  // position VIVANTE du colis (= position du détenteur)
    'ALTER TABLE shipments ADD COLUMN cur_lng REAL',
    'ALTER TABLE shipments ADD COLUMN cur_at INTEGER',
    "ALTER TABLE shipments ADD COLUMN mode TEXT DEFAULT 'livraison'", // Phase 4 : 'livraison' | 'retrait' (click-and-collect)
    'ALTER TABLE shipments ADD COLUMN pickup_code TEXT',              // retrait : code à donner au point de retrait pour récupérer
    'ALTER TABLE shipments ADD COLUMN deposit_code TEXT',             // chaîne de garde : code que l'expéditeur donne au DÉPÔT à l'entrée
    'ALTER TABLE shipments ADD COLUMN agency_id TEXT',                // agence de transport à qui le colis est confié (dashboard « Mon agence »)
  ]) { try { db.exec(sql); } catch { /* déjà */ } }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ship_agency ON shipments(agency_id, status)'); } catch { /* */ }
  db.exec(`CREATE TABLE IF NOT EXISTS carrier_defaults (
    id TEXT PRIMARY KEY, carrier_id TEXT NOT NULL, shipment_id TEXT, leg_seq INTEGER,
    reason TEXT, created_at INTEGER NOT NULL
  )`);
  ensured = true;
}

// ── utils ──
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function genTracking(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'TZ';
  for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function userPhone(userId: string): string | null {
  const r = getDb().prepare('SELECT phone FROM users WHERE id = ?').get(userId) as { phone: string | null } | undefined;
  return r?.phone || null;
}
/** Le numéro de `userId` se termine-t-il par ces 4 chiffres ? (remise façon Yango) */
export function phoneEndsWith(userId: string, last4: string): boolean {
  const p = (userPhone(userId) || '').replace(/\D/g, '');
  const f = (last4 || '').replace(/\D/g, '').slice(-4);
  return f.length === 4 && p.endsWith(f);
}

function logEvent(shipmentId: string, type: string, actorId: string | null, opts: { legSeq?: number; lat?: number; lng?: number; meta?: unknown } = {}) {
  getDb().prepare('INSERT INTO shipment_events (id, shipment_id, leg_seq, type, actor_id, lat, lng, meta, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), shipmentId, opts.legSeq ?? null, type, actorId, opts.lat ?? null, opts.lng ?? null, opts.meta ? JSON.stringify(opts.meta) : null, Date.now());
}

// ── TRAJETS déclarés ──
export interface TripInput { oLat: number; oLng: number; oLabel: string; dLat: number; dLng: number; dLabel: string; departAt: number; durationMin: number; mode: TripMode }
export function declareTrip(carrierId: string, t: TripInput): { ok: boolean; error?: string; id?: string } {
  ensure();
  if (!isVerifiedCarrier(carrierId)) return { ok: false, error: 'cni_not_verified' };
  const id = randomUUID();
  getDb().prepare('INSERT INTO trips (id, carrier_id, o_lat,o_lng,o_label, d_lat,d_lng,d_label, depart_at, duration_min, mode, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,\'open\',?)')
    .run(id, carrierId, t.oLat, t.oLng, t.oLabel.slice(0, 120), t.dLat, t.dLng, t.dLabel.slice(0, 120), t.departAt, t.durationMin, t.mode, Date.now());
  return { ok: true, id };
}
export function listMyTrips(carrierId: string) {
  ensure();
  return getDb().prepare('SELECT * FROM trips WHERE carrier_id = ? ORDER BY depart_at DESC LIMIT 50').all(carrierId);
}
export function closeTrip(carrierId: string, tripId: string) {
  ensure();
  getDb().prepare("UPDATE trips SET status='closed' WHERE id=? AND carrier_id=?").run(tripId, carrierId);
}

// ── SHIPMENT (bon de transport) ──
export interface ShipmentInput {
  sellerId: string; buyerId?: string | null; productLabel?: string; orderId?: string;
  oLat: number; oLng: number; oLabel: string; dLat: number; dLng: number; dLabel: string;
  parcelSize?: string; parcelWeight?: string; amount?: number; escrowId?: string | null;
  mode?: 'livraison' | 'retrait'; // Phase 4 : retrait = click-and-collect (code, pas de livreur si dépôt = vendeur)
  withDeposit?: boolean; // colis P2P : génère un code de dépôt (l'expéditeur le donne au dépôt à l'entrée)
  agencyId?: string | null; // agence de transport à qui confier le colis (dashboard « Mon agence »)
}
/** Code de retrait à 4 chiffres (l'acheteur le présente au point de retrait pour récupérer). */
function genPickupCode(): string { return String(1000 + Math.floor(Math.random() * 9000)); }

export function createShipment(s: ShipmentInput) {
  ensure();
  const id = randomUUID(); const now = Date.now();
  let tracking = genTracking();
  // unicité
  for (let i = 0; i < 5; i++) { if (!getDb().prepare('SELECT 1 FROM shipments WHERE tracking=?').get(tracking)) break; tracking = genTracking(); }
  const amount = Math.max(0, Math.floor(s.amount || 0));
  const retrait = s.mode === 'retrait';
  // Retrait : le colis attend au point de retrait (dépôt vendeur/agence), l'acheteur vient le
  // chercher avec un code → 'ready_for_pickup' direct. Livraison : 'created' (matching livreur).
  const status = retrait ? 'ready_for_pickup' : 'created';
  getDb().prepare(`INSERT INTO shipments (id, tracking, order_id, product_label, seller_id, buyer_id, o_lat,o_lng,o_label, d_lat,d_lng,d_label, parcel_size, parcel_weight, status, custody_user_id, amount, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, tracking, s.orderId ?? null, (s.productLabel || '').slice(0, 140), s.sellerId, s.buyerId ?? null,
      s.oLat, s.oLng, s.oLabel.slice(0, 120), s.dLat, s.dLng, s.dLabel.slice(0, 120),
      (s.parcelSize || '').slice(0, 40), (s.parcelWeight || '').slice(0, 40), status, s.sellerId /* custody initiale = vendeur */, amount, now, now);
  if (s.escrowId) getDb().prepare('UPDATE shipments SET escrow_id=? WHERE id=?').run(s.escrowId, id);
  if (s.agencyId) getDb().prepare('UPDATE shipments SET agency_id=? WHERE id=?').run(s.agencyId, id);
  let pickupCode: string | null = null;
  if (retrait) { pickupCode = genPickupCode(); getDb().prepare("UPDATE shipments SET mode='retrait', pickup_code=? WHERE id=?").run(pickupCode, id); }
  // CHAÎNE DE GARDE (colis P2P) : l'expéditeur reçoit un CODE DE DÉPÔT à donner au dépôt à l'entrée
  // (photo obligatoire à la remise). La RÉFÉRENCE = le `tracking`, écrit à la main sur le colis (pas de QR : impression difficile à Mada).
  let depositCode: string | null = null;
  if (s.withDeposit) { depositCode = genPickupCode(); getDb().prepare('UPDATE shipments SET deposit_code=? WHERE id=?').run(depositCode, id); }
  logEvent(id, retrait ? 'ready_for_pickup' : 'created', s.sellerId, { meta: { tracking, mode: retrait ? 'retrait' : 'livraison' } });
  // escrow RÉEL = celui de la commande boutique (lié via escrowId) ; libéré à la livraison / au retrait.
  if (amount > 0) logEvent(id, 'payment_held', s.sellerId, { meta: { amount, escrow: s.escrowId || null } });
  return { id, tracking, pickupCode };
}

interface ShipmentRow { id: string; tracking: string; seller_id: string; buyer_id: string | null; o_lat: number; o_lng: number; o_label: string; d_lat: number; d_lng: number; d_label: string; status: string; custody_user_id: string | null; product_label: string | null }
export function getShipment(id: string): ShipmentRow | null {
  ensure(); return (getDb().prepare('SELECT * FROM shipments WHERE id=?').get(id) as ShipmentRow) || null;
}
export function getByTracking(tracking: string): ShipmentRow | null {
  ensure(); return (getDb().prepare('SELECT * FROM shipments WHERE tracking=?').get(tracking.trim().toUpperCase()) as ShipmentRow) || null;
}
/** Le colis lié à une commande (escrow boutique/Eat) — pour ouvrir le suivi depuis l'achat. */
export function getShipmentIdByEscrow(escrowId: string): string | null {
  ensure();
  const r = getDb().prepare('SELECT id FROM shipments WHERE escrow_id=? ORDER BY created_at DESC LIMIT 1').get(escrowId) as { id: string } | undefined;
  return r?.id || null;
}
function legs(shipmentId: string) {
  return getDb().prepare('SELECT * FROM shipment_legs WHERE shipment_id=? ORDER BY seq ASC').all(shipmentId) as Record<string, unknown>[];
}
function currentOrigin(sh: ShipmentRow): { lat: number; lng: number; label: string } {
  // point de départ du PROCHAIN tronçon = destination du dernier tronçon fait, sinon origine vendeur
  const ls = legs(sh.id);
  const last = ls[ls.length - 1] as { to_lat?: number; to_lng?: number; to_label?: string; status?: string } | undefined;
  if (last && last.status === 'done') return { lat: last.to_lat!, lng: last.to_lng!, label: last.to_label || '' };
  return { lat: sh.o_lat, lng: sh.o_lng, label: sh.o_label };
}

/** Matching : trajets ouverts qui rapprochent le colis de sa destination finale. */
export function findCarriers(shipmentId: string, radiusKm = 25) {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return [];
  const from = currentOrigin(sh);
  const now = Date.now();
  const open = getDb().prepare("SELECT * FROM trips WHERE status='open' AND depart_at >= ?").all(now - 6 * 3600_000) as Record<string, number & string>[];
  const distToDest = km(from.lat, from.lng, sh.d_lat, sh.d_lng);
  return open.map((t) => {
    const startGap = km(from.lat, from.lng, t.o_lat as number, t.o_lng as number);          // le porteur part-il près d'ici ?
    const progress = distToDest - km(t.d_lat as number, t.d_lng as number, sh.d_lat, sh.d_lng); // rapproche-t-il de la destination ?
    return { trip: t, startGap, progress };
  })
    .filter((c) => c.startGap <= radiusKm && c.progress > 0)   // proche du point courant ET avance vers la dest
    .sort((a, b) => (b.progress - a.progress) || (a.startGap - b.startGap))
    .slice(0, 10);
}

/** Assigne un tronçon : déclenché par le DÉTENTEUR (propose) ou le PORTEUR lui-même (accepte).
 *  Le porteur = celui du trajet choisi. Le vrai consentement/identité = la remise aux 4 chiffres. */
export function assignLeg(shipmentId: string, requesterId: string, tripId: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.status === 'delivered' || sh.status === 'cancelled') return { ok: false, error: 'shipment_closed' };
  // un seul tronçon "actif" à la fois
  const active = legs(shipmentId).find((l) => l.status !== 'done');
  if (active) return { ok: false, error: 'leg_in_progress' };
  const trip = getDb().prepare('SELECT * FROM trips WHERE id=?').get(tripId) as Record<string, number & string> | undefined;
  if (!trip) return { ok: false, error: 'trip_not_found' };
  const carrierId = trip.carrier_id as string;
  if (!isVerifiedCarrier(carrierId)) return { ok: false, error: 'cni_not_verified' };
  // seul le détenteur courant (qui doit remettre) ou le porteur lui-même peut assigner
  if (sh.custody_user_id !== requesterId && requesterId !== carrierId) return { ok: false, error: 'not_allowed' };
  const from = currentOrigin(sh);
  const seq = legs(shipmentId).length + 1;
  getDb().prepare(`INSERT INTO shipment_legs (id, shipment_id, seq, carrier_id, mode, from_lat,from_lng,from_label, to_lat,to_lng,to_label, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'assigned',?)`)
    .run(randomUUID(), shipmentId, seq, carrierId, trip.mode, from.lat, from.lng, from.label, trip.d_lat, trip.d_lng, trip.d_label, Date.now());
  logEvent(shipmentId, 'leg_assigned', carrierId, { legSeq: seq, meta: { to: trip.d_label, mode: trip.mode } });
  return { ok: true };
}

/** Trouve un porteur VÉRIFIÉ par son numéro (normalisé : on compare les chiffres, gère l'indicatif). */
function findVerifiedCarrierByPhone(phone: string): string | null {
  const f = (phone || '').replace(/\D/g, '');
  if (f.length < 6) return null;
  const rows = getDb().prepare(`
    SELECT u.id AS id, u.phone AS phone FROM transport_profile tp
    JOIN users u ON u.id = tp.user_id
    WHERE tp.cni_status='verified' AND u.phone IS NOT NULL
  `).all() as { id: string; phone: string }[];
  for (const r of rows) {
    const p = (r.phone || '').replace(/\D/g, '');
    if (p && (p === f || p.endsWith(f) || f.endsWith(p))) return r.id;
  }
  return null;
}

/** Relais : le détenteur DÉSIGNE le porteur suivant par son NUMÉRO (rencontré au rendez-vous).
 *  Crée le tronçon (position courante → destination finale). La remise se valide ensuite aux 4 chiffres. */
export function assignCarrierByPhone(shipmentId: string, requesterId: string, phone: string): { ok: boolean; error?: string; carrier_id?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.status === 'delivered' || sh.status === 'cancelled') return { ok: false, error: 'shipment_closed' };
  if (sh.custody_user_id !== requesterId) return { ok: false, error: 'not_custodian' };
  if (legs(shipmentId).find((l) => l.status !== 'done')) return { ok: false, error: 'leg_in_progress' };
  const carrierId = findVerifiedCarrierByPhone(phone);
  if (!carrierId) return { ok: false, error: 'carrier_not_found_or_unverified' };
  if (carrierId === requesterId) return { ok: false, error: 'cannot_self' };
  const from = currentOrigin(sh);
  const seq = legs(shipmentId).length + 1;
  getDb().prepare(`INSERT INTO shipment_legs (id, shipment_id, seq, carrier_id, mode, from_lat,from_lng,from_label, to_lat,to_lng,to_label, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'assigned',?)`)
    .run(randomUUID(), shipmentId, seq, carrierId, 'inconnu', from.lat, from.lng, from.label, sh.d_lat, sh.d_lng, sh.d_label, Date.now());
  logEvent(shipmentId, 'leg_assigned', requesterId, { legSeq: seq, meta: { carrier: carrierId, by: 'phone' } });
  return { ok: true, carrier_id: carrierId };
}

/** DISPATCH AGENCE → un de ses chauffeurs actifs (depuis le dashboard « Mon agence »). L'agence n'a pas
 *  besoin d'être détentrice : le colis lui est CONFIÉ (agency_id). Crée le tronçon → le chauffeur récupère
 *  (confirmPickup, code + photo) et livre. Ne dispatche qu'à un chauffeur ACTIF de l'agence. */
export function dispatchToDriver(agencyId: string, shipmentId: string, driverId: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getDb().prepare('SELECT * FROM shipments WHERE id=?').get(shipmentId) as (ShipmentRow & { agency_id?: string | null }) | undefined;
  if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.agency_id !== agencyId) return { ok: false, error: 'not_your_shipment' };
  if (sh.status === 'delivered' || sh.status === 'cancelled') return { ok: false, error: 'shipment_closed' };
  if (!isDriverOfAgency(agencyId, driverId)) return { ok: false, error: 'not_your_driver' };
  if (legs(shipmentId).find((l) => l.status !== 'done')) return { ok: false, error: 'leg_in_progress' };
  const from = currentOrigin(sh);
  const seq = legs(shipmentId).length + 1;
  getDb().prepare(`INSERT INTO shipment_legs (id, shipment_id, seq, carrier_id, mode, from_lat,from_lng,from_label, to_lat,to_lng,to_label, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'assigned',?)`)
    .run(randomUUID(), shipmentId, seq, driverId, 'agence', from.lat, from.lng, from.label, sh.d_lat, sh.d_lng, sh.d_label, Date.now());
  logEvent(shipmentId, 'leg_assigned', agencyId, { legSeq: seq, meta: { carrier: driverId, by: 'agency' } });
  sendPushToUser(driverId, { title: '📦 Nouvelle mission', body: `Colis ${sh.tracking} à récupérer et livrer.`, url: '/transporteur' }).catch(() => {});
  return { ok: true };
}

function activeLeg(shipmentId: string) {
  return legs(shipmentId).find((l) => l.status !== 'done') as (Record<string, unknown> & { id: string; seq: number; carrier_id: string; status: string; to_lat: number; to_lng: number; to_label: string }) | undefined;
}

/** Remise BIDIRECTIONNELLE (façon Uber) : la remise est scellée par le code (4 chiffres) de
 *  l'AUTRE partie. Soit le détenteur saisit le code du porteur, soit — UX par défaut — le
 *  PORTEUR qui arrive saisit le code du détenteur ("code du tronçon précédent"). */
export function confirmPickup(shipmentId: string, actorId: string, last4: string, photoId?: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  const leg = activeLeg(shipmentId); if (!leg || leg.status !== 'assigned') return { ok: false, error: 'no_assigned_leg' };
  const custodian = sh.custody_user_id; const carrier = leg.carrier_id;
  let counterpart: string | null = null;
  if (actorId === custodian) counterpart = carrier;        // le détenteur saisit le code du porteur
  else if (actorId === carrier) counterpart = custodian;   // le porteur saisit le code du détenteur (Uber)
  else return { ok: false, error: 'not_party' };
  if (!phoneEndsWith(counterpart, last4)) return { ok: false, error: 'bad_code' };
  getDb().prepare("UPDATE shipment_legs SET status='picked' WHERE id=?").run(leg.id);
  getDb().prepare("UPDATE shipments SET custody_user_id=?, status='in_transit', updated_at=? WHERE id=?").run(carrier, Date.now(), shipmentId);
  logEvent(shipmentId, 'picked_up', carrier, { legSeq: leg.seq, meta: { photo: photoId || null } }); // photo obligatoire à la remise
  return { ok: true };
}

/** Le porteur appuie "le colis part" → en_route + ETA. */
export function markDeparted(shipmentId: string, carrierId: string, durationMin: number): { ok: boolean; error?: string } {
  ensure();
  const leg = activeLeg(shipmentId); if (!leg || leg.carrier_id !== carrierId || leg.status !== 'picked') return { ok: false, error: 'cannot_depart' };
  const now = Date.now(); const eta = now + Math.max(1, durationMin) * 60_000;
  getDb().prepare("UPDATE shipment_legs SET status='enroute', depart_at=?, eta=? WHERE id=?").run(now, eta, leg.id);
  logEvent(shipmentId, 'departed', carrierId, { legSeq: leg.seq, meta: { eta } });
  return { ok: true, ...({ eta } as object) };
}

/** Ping GPS pendant le trajet (le GPS du porteur = la position du colis). */
export function pingPosition(shipmentId: string, carrierId: string, lat: number, lng: number): { ok: boolean; error?: string } {
  ensure();
  const leg = activeLeg(shipmentId); if (!leg || leg.carrier_id !== carrierId || leg.status !== 'enroute') return { ok: false, error: 'not_enroute' };
  const now = Date.now();
  getDb().prepare('UPDATE shipment_legs SET last_lat=?, last_lng=?, last_at=?, stalled=0 WHERE id=?').run(lat, lng, now, leg.id);
  getDb().prepare('UPDATE shipments SET cur_lat=?, cur_lng=?, cur_at=?, updated_at=? WHERE id=?').run(lat, lng, now, now, shipmentId);
  logEvent(shipmentId, 'position', carrierId, { legSeq: leg.seq, lat, lng });

  // EN APPROCHE (façon Uber) : < 400 m du point d'arrivée du tronçon → notif + ouverture des pop-up.
  const lg = leg as unknown as { id: string; seq: number; to_lat: number; to_lng: number; approaching: number };
  if (!lg.approaching && typeof lg.to_lat === 'number' && km(lat, lng, lg.to_lat, lg.to_lng) <= APPROACH_KM) {
    getDb().prepare('UPDATE shipment_legs SET approaching=1 WHERE id=?').run(lg.id);
    logEvent(shipmentId, 'approaching', carrierId, { legSeq: lg.seq });
    const sh = getShipment(shipmentId);
    const isFinal = !!sh && Math.abs(lg.to_lat - sh.d_lat) < 1e-4 && Math.abs(lg.to_lng - sh.d_lng) < 1e-4;
    const recipient = isFinal ? sh?.buyer_id : null;   // dernier km → le client ; sinon rendez-vous relais
    if (recipient) sendPushToUser(recipient, { title: '🛵 Votre colis arrive', body: 'Le livreur est tout proche. Ouvre l’app : ton code va s’afficher pour la remise.', url: '/transporteur' }).catch(() => {});
    sendPushToUser(carrierId, { title: '📍 Vous arrivez', body: 'Demandez le code (4 chiffres) au destinataire pour valider la remise.', url: '/transporteur' }).catch(() => {});
  }
  return { ok: true };
}

/** Le DÉTENTEUR partage sa position (point de rendez-vous pour le maillon suivant, ou
 *  simple suivi). Marche dans tous les états tant qu'il a la garde. */
export function shareColisPosition(shipmentId: string, userId: string, lat: number, lng: number): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.custody_user_id !== userId) return { ok: false, error: 'not_custodian' };
  const now = Date.now();
  getDb().prepare('UPDATE shipments SET cur_lat=?, cur_lng=?, cur_at=?, updated_at=? WHERE id=?').run(lat, lng, now, now, shipmentId);
  const al = activeLeg(shipmentId);
  logEvent(shipmentId, 'position', userId, { legSeq: al ? (al as { seq: number }).seq : undefined, lat, lng, meta: { rendezvous: true } });
  return { ok: true };
}

/** L'ACHETEUR donne sa position de livraison (épingle) → devient la destination du colis. */
export function setBuyerDropoff(shipmentId: string, buyerId: string, lat: number, lng: number): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.buyer_id !== buyerId) return { ok: false, error: 'not_buyer' };
  getDb().prepare('UPDATE shipments SET d_lat=?, d_lng=?, d_label=?, updated_at=? WHERE id=?').run(lat, lng, 'Position client (épingle)', Date.now(), shipmentId);
  logEvent(shipmentId, 'dropoff_set', buyerId, { lat, lng });
  return { ok: true };
}

/** Fin de tronçon intermédiaire : le porteur est arrivé à SA destination mais ce n'est pas
 *  le client final. Il clôt son tronçon et GARDE le colis sur lui (main-à-main) jusqu'à ce
 *  que le maillon suivant vienne le prendre (via un nouveau pickup aux 4 chiffres). */
export function markArrived(shipmentId: string, carrierId: string): { ok: boolean; error?: string } {
  ensure();
  const leg = activeLeg(shipmentId); if (!leg || leg.carrier_id !== carrierId || leg.status !== 'enroute') return { ok: false, error: 'not_enroute' };
  getDb().prepare("UPDATE shipment_legs SET status='done' WHERE id=?").run(leg.id);
  // custody INCHANGÉE : le porteur garde le colis sur lui jusqu'au prochain maillon.
  logEvent(shipmentId, 'arrived', carrierId, { legSeq: leg.seq, meta: { at: leg.to_label } });
  return { ok: true };
}

/** Livraison finale au client : le dernier porteur saisit les 4 chiffres du client. */
export function confirmDelivery(shipmentId: string, carrierId: string, last4: string, photoId?: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (!sh.buyer_id) return { ok: false, error: 'no_buyer' };
  const leg = activeLeg(shipmentId); if (!leg || leg.carrier_id !== carrierId || leg.status !== 'enroute') return { ok: false, error: 'cannot_deliver' };
  if (!phoneEndsWith(sh.buyer_id, last4)) return { ok: false, error: 'bad_code' };
  getDb().prepare("UPDATE shipment_legs SET status='done' WHERE id=?").run(leg.id);
  getDb().prepare("UPDATE shipments SET custody_user_id=?, status='delivered', updated_at=? WHERE id=?").run(sh.buyer_id, Date.now(), shipmentId);
  logEvent(shipmentId, 'delivered', carrierId, { legSeq: leg.seq, meta: { photo: photoId || null } });
  releaseShipmentPayment(shipmentId);   // règlement RÉEL à la livraison (escrow → vendeur + porteurs + plateforme)
  return { ok: true };
}

/** RETRAIT (Phase 4) — l'acheteur vient chercher son colis. Le DÉTENTEUR au point de retrait
 *  (vendeur pour un retrait chez le vendeur, sinon le transporteur du dépôt) saisit le code de
 *  retrait que l'acheteur lui montre → colis remis → escrow libéré (comme une livraison). */
export function confirmCollect(shipmentId: string, actorId: string, code: string, photoId?: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getDb().prepare('SELECT * FROM shipments WHERE id=?').get(shipmentId) as (ShipmentRow & { mode?: string; pickup_code?: string | null; custody_user_id?: string | null }) | undefined;
  if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.mode !== 'retrait') return { ok: false, error: 'not_pickup' };
  if (sh.status === 'delivered') return { ok: true };                        // idempotent
  if (sh.status !== 'ready_for_pickup') return { ok: false, error: 'not_ready' };
  if (actorId !== sh.custody_user_id) return { ok: false, error: 'not_custodian' }; // seul le détenteur remet
  if (!sh.pickup_code || (code || '').replace(/\D/g, '').slice(-4) !== sh.pickup_code) return { ok: false, error: 'bad_code' };
  getDb().prepare("UPDATE shipments SET status='delivered', custody_user_id=?, updated_at=? WHERE id=?").run(sh.buyer_id, Date.now(), shipmentId);
  logEvent(shipmentId, 'collected', actorId, { meta: { mode: 'retrait', photo: photoId || null } });
  releaseShipmentPayment(shipmentId);   // règlement RÉEL au retrait (escrow → vendeur + plateforme ; livraison=0)
  if (sh.buyer_id) sendPushToUser(sh.buyer_id, { title: '✅ Colis récupéré', body: `Retrait ${sh.tracking} confirmé.`, url: '/mes-commandes' }).catch(() => {});
  return { ok: true };
}

/** CHAÎNE DE GARDE — entrée au DÉPÔT (colis P2P). L'expéditeur amène son colis + donne son CODE DE
 *  DÉPÔT ; le dépôt le saisit + prend une PHOTO → le colis passe sous la garde du dépôt ('at_depot').
 *  Ensuite le relais continue via le matching porteur (assignLeg → confirmPickup, code+photo). */
export function depotReceive(shipmentId: string, depotId: string, code: string, photoId?: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getDb().prepare('SELECT * FROM shipments WHERE id=?').get(shipmentId) as (ShipmentRow & { deposit_code?: string | null }) | undefined;
  if (!sh) return { ok: false, error: 'shipment_not_found' };
  if (sh.status === 'at_depot') return { ok: true }; // idempotent
  if (sh.status !== 'created') return { ok: false, error: 'not_receivable' };
  if (!sh.deposit_code || (code || '').replace(/\D/g, '').slice(-4) !== sh.deposit_code) return { ok: false, error: 'bad_code' };
  getDb().prepare("UPDATE shipments SET status='at_depot', custody_user_id=?, updated_at=? WHERE id=?").run(depotId, Date.now(), shipmentId);
  logEvent(shipmentId, 'received_at_depot', depotId, { meta: { photo: photoId || null } });
  if (sh.seller_id) sendPushToUser(sh.seller_id, { title: '📦 Colis déposé', body: `${sh.tracking} pris en charge par le dépôt.`, url: '/mes-commandes' }).catch(() => {});
  return { ok: true };
}

/** Règlement à la livraison — RÉEL (escrow). Si le colis est lié à un escrow (commande boutique) :
 *  on route la part `livraison` vers les PORTEURS de la chaîne (répartie), puis on libère l'escrow
 *  (vendeur = article, plateforme = commission, porteur(s) = livraison). Idempotent (paid + status
 *  escrow). Sans escrow lié (colis hors commande payée) → simple trace, aucun mouvement inventé. */
function releaseShipmentPayment(shipmentId: string) {
  const sh = getShipment(shipmentId) as (ShipmentRow & { amount?: number; paid?: number; escrow_id?: string | null }) | null;
  if (!sh || sh.paid) return;
  getDb().prepare('UPDATE shipments SET paid=1, updated_at=? WHERE id=?').run(Date.now(), shipmentId);
  const escrowId = sh.escrow_id || null;
  const carriers = Array.from(new Set(legs(shipmentId).map((l) => l.carrier_id as string).filter(Boolean)));

  if (!escrowId) {
    // Aucun escrow réel lié (ex. colis créé hors commande payée) → on ne fabrique pas d'argent.
    logEvent(shipmentId, 'payment_released', null, { meta: { escrow: null, carriers: carriers.length } });
    return;
  }

  // 1) Router la part 'livraison' de l'escrow vers les porteurs (répartie à parts égales, reste au dernier).
  const esc = getEscrow(escrowId);
  const livraison = (esc?.breakdown || []).filter((p) => p.role === 'livraison').reduce((s, p) => s + p.amount_cents, 0);
  if (livraison > 0 && carriers.length > 0) {
    const per = Math.floor(livraison / carriers.length);
    const parts = carriers.map((cid, i) => ({ user_id: cid, amount_cents: i === carriers.length - 1 ? livraison - per * (carriers.length - 1) : per }));
    reassignEscrowPart(escrowId, 'livraison', parts);
  }
  // 2) Libérer l'escrow RÉEL : chaque bénéficiaire (vendeur/plateforme/porteurs) est crédité (atomique, idempotent).
  const r = releaseEscrow(escrowId);
  logEvent(shipmentId, 'payment_released', null, { meta: { escrow: escrowId, released: r.ok, error: r.error, carriers: carriers.length, livraison } });

  // 3) Notifs RÉELLES (plus de « simulé »).
  sendPushToUser(sh.seller_id, { title: '💰 Paiement libéré', body: `Colis ${sh.tracking} livré — ta part est créditée sur ton solde.`, url: '/transporteur' }).catch(() => {});
  for (const cid of carriers) {
    sendPushToUser(cid, { title: '💰 Course payée', body: `Livraison du colis ${sh.tracking} confirmée — ta part est créditée.`, url: '/transporteur' }).catch(() => {});
  }
}

// ── TRACE (itinéraire vivant) ──
export function getTrace(shipmentId: string) {
  ensure();
  try { checkShipmentStall(shipmentId); } catch { /* watchdog best-effort */ }
  const sh = getShipment(shipmentId); if (!sh) return null;
  const evs = getDb().prepare('SELECT type, leg_seq, actor_id, lat, lng, meta, created_at FROM shipment_events WHERE shipment_id=? ORDER BY created_at ASC').all(shipmentId);
  // Le code de retrait ne transite JAMAIS par la trace (sinon le détenteur validerait sans
  // l'acheteur présent) : l'acheteur le voit seulement via listMyShipments (buyer-only).
  const { pickup_code: _omit, deposit_code: _omit2, ...safe } = sh as ShipmentRow & { pickup_code?: string | null; deposit_code?: string | null };
  return { shipment: safe, legs: legs(sh.id), events: evs };
}

/** Mes colis (en tant que vendeur, acheteur ou porteur courant). */
export function listMyShipments(userId: string) {
  ensure();
  const rows = getDb().prepare('SELECT id, tracking, product_label, status, custody_user_id, o_label, d_label, seller_id, buyer_id, mode, pickup_code, deposit_code FROM shipments WHERE seller_id=? OR buyer_id=? OR custody_user_id=? ORDER BY updated_at DESC LIMIT 50')
    .all(userId, userId, userId) as (Record<string, unknown> & { buyer_id?: string; custody_user_id?: string; pickup_code?: string | null; deposit_code?: string | null })[];
  // Les codes ne sont montrés QU'À l'expéditeur/acheteur (il les présente) — jamais au détenteur qui les saisit.
  return rows.map((r) => ({ ...r, pickup_code: r.buyer_id === userId ? r.pickup_code : undefined, deposit_code: r.buyer_id === userId ? r.deposit_code : undefined }));
}

/** Les colis CONFIÉS à une agence (dashboard « Mon agence » → à dispatcher). Codes jamais exposés à l'agence. */
export function listAgencyShipments(agencyId: string) {
  ensure();
  return getDb().prepare("SELECT id, tracking, product_label, status, custody_user_id, o_label, d_label, seller_id, buyer_id, mode FROM shipments WHERE agency_id=? AND status != 'delivered' ORDER BY updated_at DESC LIMIT 50")
    .all(agencyId);
}

// ════════════════════════════ BRIQUE C : watchdog + exceptions + contacts ════════════════════════════

function uLabel(id: string | null): string {
  if (!id) return 'Inconnu';
  const r = getDb().prepare('SELECT username, display_name FROM users WHERE id = ?').get(id) as { username: string | null; display_name: string | null } | undefined;
  return (r?.display_name || r?.username || 'Utilisateur').toString();
}

/** Chaîne ordonnée des participants : vendeur → porteurs (ordre des tronçons) → client. */
function chain(sh: ShipmentRow): { user_id: string; role: string }[] {
  const out: { user_id: string; role: string }[] = [{ user_id: sh.seller_id, role: 'vendeur' }];
  for (const l of legs(sh.id)) {
    const cid = l.carrier_id as string | null;
    if (cid && out[out.length - 1].user_id !== cid) out.push({ user_id: cid, role: 'porteur' });
  }
  if (sh.buyer_id) out.push({ user_id: sh.buyer_id, role: 'client' });
  return out;
}

/** Faute enregistrée contre un porteur + suspension auto si manquements répétés. */
function recordDefault(carrierId: string, shipmentId: string, legSeq: number, reason: string) {
  getDb().prepare('INSERT INTO carrier_defaults (id, carrier_id, shipment_id, leg_seq, reason, created_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), carrierId, shipmentId, legSeq, reason.slice(0, 200), Date.now());
  const n = (getDb().prepare('SELECT COUNT(*) c FROM carrier_defaults WHERE carrier_id=?').get(carrierId) as { c: number }).c;
  if (n >= DEFAULT_SUSPEND_AT) { try { setCniStatus(carrierId, 'reject', `Suspendu : ${n} manquements d'acheminement`); } catch { /* */ } }
  return n;
}

/** DÉNONCIATION (niveau 2) : un chaînon ne dénoue pas → on prévient le responsable. */
function denounce(shipmentId: string) {
  const sh = getShipment(shipmentId); if (!sh) return;
  const leg = activeLeg(shipmentId); if (!leg) return;
  const l = leg as unknown as { id: string; seq: number; carrier_id: string };
  getDb().prepare('UPDATE shipment_legs SET denounced=1 WHERE id=?').run(l.id);
  getDb().prepare("UPDATE shipments SET alert='manquement', updated_at=? WHERE id=?").run(Date.now(), shipmentId);
  const n = recordDefault(l.carrier_id, shipmentId, l.seq, 'Non-dénouement du tronçon (colis bloqué, porteur sans réponse)');
  logEvent(shipmentId, 'denounced', null, { legSeq: l.seq, meta: { carrier: l.carrier_id, defaults: n } });
  // Responsable #1 : le vendeur (propriétaire de l'envoi).
  sendPushToUser(sh.seller_id, { title: '🚨 Colis bloqué — manquement', body: `Le porteur du colis ${sh.tracking} ne dénoue pas (sans réponse). Reprends la main : relance un porteur / joins-le.`, url: '/transporteur' }).catch(() => {});
  // Responsable #2 : la plateforme (watchdog Telegram — doctrine "aboyer").
  notifyTelegram(`🚨 ACHEMINEMENT — manquement\nColis ${sh.tracking} bloqué au tronçon ${l.seq}. Porteur ${uLabel(l.carrier_id)} (${l.carrier_id}) sans réponse. Manquements cumulés: ${n}${n >= DEFAULT_SUSPEND_AT ? ' → SUSPENDU' : ''}.`);
}

/** Watchdog d'UN colis. Niveau 1 : à l'arrêt → ping porteur. Niveau 2 : pas dénoué → dénonciation. */
export function checkShipmentStall(shipmentId: string): boolean {
  ensure();
  const leg = activeLeg(shipmentId);
  if (!leg || (leg.status !== 'enroute' && leg.status !== 'picked')) return false;
  const l = leg as unknown as { id: string; seq: number; carrier_id: string; status: string; last_at: number | null; depart_at: number | null; eta: number | null; stalled: number; stalled_at: number | null; denounced: number; created_at: number };
  const now = Date.now();

  // Niveau 2 : déjà flaggé "à l'arrêt" et toujours pas dénoué après le délai → dénonciation.
  if (l.stalled && !l.denounced && l.stalled_at && now - l.stalled_at > DENOUNCE_MS) { denounce(shipmentId); return true; }
  if (l.stalled) return false; // déjà au niveau 1, on attend la résolution

  // Niveau 1 : immobile trop longtemps (ou pris mais jamais reparti) / ETA dépassée.
  const since = Math.max(l.last_at || 0, l.depart_at || 0, l.created_at || 0) || now;
  const noMove = now - since > STALL_MS;
  const overEta = !!l.eta && now > l.eta + ETA_GRACE_MS;
  if (!noMove && !overEta) return false;
  getDb().prepare('UPDATE shipment_legs SET stalled=1, stalled_at=? WHERE id=?').run(now, l.id);
  logEvent(shipmentId, 'exception', null, { legSeq: l.seq, meta: { kind: overEta ? 'eta_depassee' : 'arret', auto: true } });
  sendPushToUser(l.carrier_id, { title: '🚚 Colis — tout va bien ?', body: 'Vous semblez à l’arrêt. Un problème ? (Panne / Pause / RAS)', url: '/transporteur' }).catch(() => {});
  return true;
}

/** Scan global (cron) : tous les tronçons en route. Renvoie le nb de nouveaux flags. */
export function checkAllStalls(): number {
  ensure();
  const rows = getDb().prepare("SELECT DISTINCT shipment_id FROM shipment_legs WHERE status='enroute' AND stalled=0").all() as { shipment_id: string }[];
  let n = 0;
  for (const r of rows) if (checkShipmentStall(r.shipment_id)) n++;
  return n;
}

/** Réponse du porteur au ping "à l'arrêt". panne → escalade vendeur ; pause/ras → on réarme. */
export function carrierStatusReply(shipmentId: string, carrierId: string, kind: 'panne' | 'pause' | 'ras'): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  const leg = activeLeg(shipmentId);
  if (!leg || leg.carrier_id !== carrierId) return { ok: false, error: 'not_active_carrier' };
  const now = Date.now();
  if (kind === 'panne') {
    getDb().prepare('UPDATE shipments SET alert=?, updated_at=? WHERE id=?').run('panne', now, shipmentId);
    logEvent(shipmentId, 'exception', carrierId, { legSeq: leg.seq, meta: { kind: 'panne' } });
    // Escalade : le vendeur (oversight) est prévenu et peut joindre le maillon + relancer un porteur.
    sendPushToUser(sh.seller_id, { title: '⚠️ Colis en panne', body: `Le porteur du colis ${sh.tracking} signale une panne. Tu peux le joindre et relancer un porteur.`, url: '/transporteur' }).catch(() => {});
  } else {
    // pause/RAS : on réarme le watchdog (réinitialise le compteur d'immobilité).
    getDb().prepare('UPDATE shipment_legs SET stalled=0, stalled_at=NULL, last_at=? WHERE id=?').run(now, (leg as { id: string }).id);
    getDb().prepare('UPDATE shipments SET alert=NULL, updated_at=? WHERE id=?').run(now, shipmentId);
    logEvent(shipmentId, 'carrier_ok', carrierId, { legSeq: leg.seq, meta: { kind } });
  }
  return { ok: true };
}

/** Contacts CLOISONNÉS : qui ce user peut joindre (voisins de chaîne + règles oversight). Sans numéro. */
export function getContacts(shipmentId: string, userId: string): { user_id: string; label: string; role: string; relation: string }[] {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return [];
  const c = chain(sh);
  const idx = c.findIndex((p) => p.user_id === userId);
  const out: { user_id: string; label: string; role: string; relation: string }[] = [];
  const add = (p: { user_id: string; role: string } | undefined, relation: string) => {
    if (p && p.user_id !== userId && !out.find((o) => o.user_id === p.user_id)) out.push({ user_id: p.user_id, label: uLabel(p.user_id), role: p.role, relation });
  };
  if (idx >= 0) { add(c[idx - 1], 'maillon précédent'); add(c[idx + 1], 'maillon suivant'); }
  // Vendeur = oversight : peut toujours joindre le détenteur courant.
  if (userId === sh.seller_id && sh.custody_user_id) add({ user_id: sh.custody_user_id, role: 'détenteur' }, 'détenteur actuel');
  // Client : peut joindre le porteur actif (dernier maillon) à tout moment.
  if (userId === sh.buyer_id) { const al = activeLeg(shipmentId); if (al) add({ user_id: (al as { carrier_id: string }).carrier_id, role: 'porteur' }, 'porteur en cours'); }
  return out;
}

/** Contact masqué (sans téléphone) : ping le destinataire autorisé via notification. */
export function pingContact(shipmentId: string, fromId: string, toId: string): { ok: boolean; error?: string } {
  ensure();
  const sh = getShipment(shipmentId); if (!sh) return { ok: false, error: 'shipment_not_found' };
  const allowed = getContacts(shipmentId, fromId).some((c) => c.user_id === toId);
  if (!allowed) return { ok: false, error: 'not_allowed' };
  sendPushToUser(toId, { title: '📦 Colis ' + sh.tracking, body: `${uLabel(fromId)} souhaite vous joindre au sujet du colis.`, url: '/transporteur' }).catch(() => {});
  logEvent(shipmentId, 'contact', fromId, { meta: { to: toId } });
  return { ok: true };
}

// ════════════════════════════ DÉMO bout-en-bout (test de toute la chaîne) ════════════════════════════
import { devForceVerify } from '@/lib/transport-profile';

const C = { Toamasina: { lat: -18.1492, lng: 49.4023 }, Antananarivo: { lat: -18.8792, lng: 47.5079 } };

/** Crée un porteur "bot" (user minimal + profil vérifié) avec un téléphone connu. */
function ensureBot(id: string, username: string, name: string, phone: string) {
  const now = Date.now();
  try { getDb().prepare('INSERT OR IGNORE INTO users (id, talk2me_id, username, display_name, created_at) VALUES (?,?,?,?,?)').run(id, id.slice(-6), username, name, now); } catch { /* */ }
  try { getDb().prepare('UPDATE users SET phone=? WHERE id=?').run(phone, id); } catch { /* */ }
  devForceVerify(id, name, phone);
}

/** Joue TOUTE la chaîne pour `sellerId` (le vendeur = l'utilisateur courant) et lui notifie
 *  chaque étape. Porteurs + client = bots. Paiement final SIMULÉ. Renvoie le tracking. */
export function runDemo(sellerId: string): { ok: boolean; shipment_id?: string; tracking?: string; error?: string } {
  ensure();
  const A = 'demo_carrierA', B = 'demo_scooterB', CLI = 'demo_clientC';
  ensureBot(A, 'porteur_brousse', 'RAKOTO Jean (taxi-brousse)', '0340000111');
  ensureBot(B, 'scooter_tana', 'RABE Koto (scooter Tana)', '0340000222');
  ensureBot(CLI, 'client_demo', 'Client Démo', '0340000333');

  const note = (msg: string) => sendPushToUser(sellerId, { title: '📦 Suivi colis', body: msg, url: '/transporteur' }).catch(() => {});

  // Trajets déclarés des porteurs
  const tA = declareTrip(A, { oLat: C.Toamasina.lat, oLng: C.Toamasina.lng, oLabel: 'Toamasina', dLat: C.Antananarivo.lat, dLng: C.Antananarivo.lng, dLabel: 'Antananarivo', departAt: Date.now(), durationMin: 480, mode: 'taxibrousse' });
  const tB = declareTrip(B, { oLat: C.Antananarivo.lat, oLng: C.Antananarivo.lng, oLabel: 'Antananarivo (gare)', dLat: C.Antananarivo.lat + 0.02, dLng: C.Antananarivo.lng + 0.02, dLabel: 'Antananarivo (client)', departAt: Date.now(), durationMin: 30, mode: 'scooter' });
  if (!tA.id || !tB.id) return { ok: false, error: 'trip_failed' };

  // Article → bon de transport (Toamasina → Tana), 50 000 Ar, client = bot
  const sh = createShipment({ sellerId, buyerId: CLI, productLabel: 'T-shirt (annonce démo)', oLat: C.Toamasina.lat, oLng: C.Toamasina.lng, oLabel: 'Toamasina', dLat: C.Antananarivo.lat, dLng: C.Antananarivo.lng, dLabel: 'Antananarivo', amount: 50000 });
  note(`Commande reçue — bon de transport ${sh.tracking} créé. Paiement bloqué (simulé).`);

  // Tronçon 1 : Toamasina → Tana (taxi-brousse)
  assignLeg(sh.id, sellerId, tA.id); note('Porteur trouvé : taxi-brousse Toamasina→Tana.');
  confirmPickup(sh.id, sellerId, '0111'); note('Colis remis au porteur (vérif 4 chiffres ✓).');
  markDeparted(sh.id, A, 480); note('🚚 Le colis part de Toamasina. Suivi GPS actif.');
  pingPosition(sh.id, A, -18.5, 48.4); note('En chemin… (position mise à jour).');
  markArrived(sh.id, A); note('Arrivé à Tana. Le porteur garde le colis jusqu’au maillon suivant.');

  // Tronçon 2 : Tana gare → client (scooter)
  assignLeg(sh.id, A, tB.id); note('Scooter trouvé pour le dernier km.');
  confirmPickup(sh.id, A, '0222'); note('Colis remis au scooter (4 chiffres ✓).');
  markDeparted(sh.id, B, 30); note('🛵 Dernier km vers le client.');
  pingPosition(sh.id, B, C.Antananarivo.lat + 0.01, C.Antananarivo.lng + 0.01);
  confirmDelivery(sh.id, B, '0333'); // → livré + paiement libéré (simulé, notifie déjà le vendeur)

  return { ok: true, shipment_id: sh.id, tracking: sh.tracking };
}
