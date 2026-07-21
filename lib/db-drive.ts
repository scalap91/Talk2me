/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-drive — domaine « Drive & Comm » (Ecosysteme Talk : SMS Talk, appels,
 * livreurs/courses #23, favoris, adresses) sous-extrait de lib/db-posts (decoupage
 * #53, Pascal 2026-06-30). getDb via socle ; getUserById via facade. Re-exporte par db.ts.
 */
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db-core';
import type { DbUser } from '@/lib/db-core';
import { getUserById } from '@/lib/db';

// ============ Écosystème Talk — COUCHE COMMUNICATION (SMS Talk) ============
// Messagerie interne Talk↔Talk, SÉPARÉE des amis T2M et de ChatTalk (pas de L2).
// Blocage indépendant par couche via comm_contacts.status='blocked'.

export interface CommPeer {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

function commPeer(u: DbUser | null): CommPeer | null {
  if (!u) return null;
  return {
    id: u.id,
    talk2me_id: u.talk2me_id,
    username: u.username,
    display_name: u.display_name ?? null,
    avatar_url: (u as { avatar_url?: string | null }).avatar_url ?? null,
  };
}

/** A a-t-il bloqué B au niveau COMM (B ne peut plus joindre A) ? */
export function isCommBlocked(ownerId: string, contactId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM comm_contacts WHERE owner_id = ? AND contact_id = ? AND status = 'blocked'")
    .get(ownerId, contactId);
  return !!row;
}

/** Ajoute/garantit un contact comm (carnet de communication, PAS un ami T2M). */
export function upsertCommContact(ownerId: string, contactId: string, kind: 'sms' | 'call' = 'sms'): void {
  if (ownerId === contactId) return;
  getDb()
    .prepare(
      `INSERT INTO comm_contacts (id, owner_id, contact_id, kind, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)
       ON CONFLICT(owner_id, contact_id) DO NOTHING`
    )
    .run(randomUUID(), ownerId, contactId, kind, Date.now());
}

export function setCommBlock(ownerId: string, contactId: string, blocked: boolean): void {
  const db = getDb();
  upsertCommContact(ownerId, contactId);
  db.prepare("UPDATE comm_contacts SET status = ? WHERE owner_id = ? AND contact_id = ?")
    .run(blocked ? 'blocked' : 'active', ownerId, contactId);
}

/** Envoie un SMS Talk. Retourne {ok} ou {error}. Respecte le blocage comm. */
export function sendSmsTalk(senderId: string, recipientId: string, text: string): { ok: boolean; error?: string; id?: string } {
  const t = (text || '').trim().slice(0, 2000);
  if (!t) return { ok: false, error: 'empty' };
  if (senderId === recipientId) return { ok: false, error: 'self' };
  if (!getUserById(recipientId)) return { ok: false, error: 'no_recipient' };
  if (isCommBlocked(recipientId, senderId)) return { ok: false, error: 'blocked' };
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO sms_messages (id, sender_id, recipient_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, senderId, recipientId, t, Date.now());
  // Le carnet comm des deux côtés (sans aucune amitié T2M).
  upsertCommContact(senderId, recipientId, 'sms');
  upsertCommContact(recipientId, senderId, 'sms');
  return { ok: true, id };
}

/** Liste des conversations SMS Talk de l'user (dernier message + non-lus). */
export function getSmsThreads(userId: string): {
  peer: CommPeer;
  last_text: string;
  last_at: number;
  unread: number;
  blocked: boolean;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT other_id, MAX(created_at) AS last_at FROM (
         SELECT recipient_id AS other_id, created_at FROM sms_messages WHERE sender_id = ?
         UNION ALL
         SELECT sender_id AS other_id, created_at FROM sms_messages WHERE recipient_id = ?
       ) GROUP BY other_id ORDER BY last_at DESC LIMIT 100`
    )
    .all(userId, userId) as { other_id: string; last_at: number }[];
  return rows
    .map((r) => {
      const last = db
        .prepare(
          `SELECT text FROM sms_messages
           WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(userId, r.other_id, r.other_id, userId) as { text: string } | undefined;
      const unread = (
        db
          .prepare('SELECT COUNT(*) c FROM sms_messages WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
          .get(userId, r.other_id) as { c: number }
      ).c;
      const peer = commPeer(getUserById(r.other_id));
      if (!peer) return null;
      return { peer, last_text: last?.text ?? '', last_at: r.last_at, unread, blocked: isCommBlocked(userId, r.other_id) };
    })
    .filter(Boolean) as { peer: CommPeer; last_text: string; last_at: number; unread: number; blocked: boolean }[];
}

/** Messages d'un thread SMS Talk + marque comme lus ceux reçus. */
export function getSmsThread(userId: string, otherId: string): { messages: { id: string; from_me: boolean; text: string; created_at: number }[]; peer: CommPeer | null } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, sender_id, text, created_at FROM sms_messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC LIMIT 500`
    )
    .all(userId, otherId, otherId, userId) as { id: string; sender_id: string; text: string; created_at: number }[];
  db.prepare('UPDATE sms_messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL').run(
    Date.now(),
    userId,
    otherId
  );
  return {
    messages: rows.map((m) => ({ id: m.id, from_me: m.sender_id === userId, text: m.text, created_at: m.created_at })),
    peer: commPeer(getUserById(otherId)),
  };
}

/** Historique d'appels (Call Talk) de l'user — entrant/sortant, audio/vidéo. */
export function getCallHistory(userId: string, limit = 100): {
  id: string;
  peer: CommPeer | null;
  direction: 'out' | 'in';
  kind: string;
  state: string;
  started_at: number;
  duration_s: number | null;
}[] {
  const rows = getDb()
    .prepare(
      `SELECT id, caller_id, callee_id, kind, state, started_at, accepted_at, ended_at
       FROM calls WHERE caller_id = ? OR callee_id = ? ORDER BY started_at DESC LIMIT ?`
    )
    .all(userId, userId, limit) as {
    id: string;
    caller_id: string;
    callee_id: string;
    kind: string;
    state: string;
    started_at: number;
    accepted_at: number | null;
    ended_at: number | null;
  }[];
  return rows.map((c) => {
    const out = c.caller_id === userId;
    const otherId = out ? c.callee_id : c.caller_id;
    const duration = c.accepted_at && c.ended_at ? Math.round((c.ended_at - c.accepted_at) / 1000) : null;
    return {
      id: c.id,
      peer: commPeer(getUserById(otherId)),
      direction: out ? 'out' : 'in',
      kind: c.kind,
      state: c.state,
      started_at: c.started_at,
      duration_s: duration,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Talk N Drive (#23) — ride-hailing tuk-tuk. Asset-light, cash à bord, gratuit.
// ─────────────────────────────────────────────────────────────────────────

const DRIVER_STALE_MS = 90_000; // au-delà, on considère le chauffeur hors-ligne

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export type VehicleType = 'tuktuk' | 'moto' | 'voiture';
export type RideStatus = 'demandee' | 'acceptee' | 'en_route' | 'a_bord' | 'terminee' | 'annulee';

export interface DriverPing {
  peer: CommPeer;
  vehicle_type: string;
  distance_km: number;
  favorite: boolean;
}

/** Le chauffeur passe en ligne / met à jour sa position (heartbeat). */
export function setDriverStatus(
  userId: string,
  online: boolean,
  lat?: number | null,
  lng?: number | null,
  vehicleType: VehicleType = 'tuktuk'
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO drivers (user_id, vehicle_type, is_online, last_lat, last_lng, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         vehicle_type = excluded.vehicle_type,
         is_online = excluded.is_online,
         last_lat = COALESCE(excluded.last_lat, drivers.last_lat),
         last_lng = COALESCE(excluded.last_lng, drivers.last_lng),
         last_seen_at = excluded.last_seen_at`
    )
    .run(userId, vehicleType, online ? 1 : 0, lat ?? null, lng ?? null, now, now);
}

export function getDriverProfile(userId: string): {
  vehicle_type: string;
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
} | null {
  const r = getDb()
    .prepare('SELECT vehicle_type, is_online, last_lat, last_lng, last_seen_at FROM drivers WHERE user_id = ?')
    .get(userId) as
    | { vehicle_type: string; is_online: number; last_lat: number | null; last_lng: number | null; last_seen_at: number | null }
    | undefined;
  if (!r) return null;
  const fresh = (r.last_seen_at ?? 0) > Date.now() - DRIVER_STALE_MS;
  return {
    vehicle_type: r.vehicle_type,
    is_online: r.is_online === 1 && fresh,
    last_lat: r.last_lat,
    last_lng: r.last_lng,
  };
}

/** Chauffeurs en ligne les plus proches d'un point (tri par distance). */
export function getNearbyDrivers(riderId: string, lat: number, lng: number, limit = 12): DriverPing[] {
  const rows = getDb()
    .prepare(
      `SELECT user_id, vehicle_type, last_lat, last_lng FROM drivers
       WHERE is_online = 1 AND last_seen_at > ? AND last_lat IS NOT NULL AND user_id != ?`
    )
    .all(Date.now() - DRIVER_STALE_MS, riderId) as {
    user_id: string;
    vehicle_type: string;
    last_lat: number;
    last_lng: number;
  }[];
  const favs = new Set(getFavoriteDriverIds(riderId));
  return rows
    .map((r) => {
      const peer = commPeer(getUserById(r.user_id));
      if (!peer) return null;
      return {
        peer,
        vehicle_type: r.vehicle_type,
        distance_km: Math.round(haversineKm(lat, lng, r.last_lat, r.last_lng) * 10) / 10,
        favorite: favs.has(r.user_id),
      } as DriverPing;
    })
    .filter((d): d is DriverPing => d !== null)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.distance_km - b.distance_km)
    .slice(0, limit);
}

function logRideEvent(rideId: string, from: string | null, to: string, actorId: string | null): void {
  getDb()
    .prepare('INSERT INTO ride_events (id, ride_id, from_status, to_status, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), rideId, from, to, actorId, Date.now());
}

/** Le passager demande une course (optionnellement ciblée sur un chauffeur). */
export function createRide(
  riderId: string,
  pickupLat: number,
  pickupLng: number,
  driverId?: string | null,
  pickupLabel?: string | null,
  opts?: { destLat?: number | null; destLng?: number | null; destLabel?: string | null; fareCents?: number | null; distanceM?: number | null }
): { id: string } {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO rides (id, rider_id, driver_id, pickup_lat, pickup_lng, pickup_label, dropoff_label, dest_lat, dest_lng, fare_cents, distance_m, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demandee', ?, ?)`
    )
    .run(id, riderId, driverId ?? null, pickupLat, pickupLng, pickupLabel ?? null,
      opts?.destLabel ?? null, opts?.destLat ?? null, opts?.destLng ?? null,
      opts?.fareCents ?? null, opts?.distanceM ?? null, now, now);
  logRideEvent(id, null, 'demandee', riderId);
  return { id };
}

const RIDE_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  demandee: ['acceptee', 'annulee'],
  acceptee: ['en_route', 'annulee'],
  en_route: ['a_bord', 'annulee'],
  a_bord: ['terminee'],
  terminee: [],
  annulee: [],
};

export function updateRideStatus(
  rideId: string,
  actorId: string,
  to: RideStatus,
  driverId?: string
): { ok: boolean; error?: string } {
  const db = getDb();
  const ride = db.prepare('SELECT status, rider_id, driver_id FROM rides WHERE id = ?').get(rideId) as
    | { status: RideStatus; rider_id: string; driver_id: string | null }
    | undefined;
  if (!ride) return { ok: false, error: 'no_ride' };
  if (!RIDE_TRANSITIONS[ride.status]?.includes(to)) return { ok: false, error: 'bad_transition' };
  // L'acceptation pose le chauffeur (s'il n'était pas pré-ciblé).
  if (to === 'acceptee' && driverId) {
    db.prepare('UPDATE rides SET status = ?, driver_id = ?, updated_at = ? WHERE id = ?').run(to, driverId, Date.now(), rideId);
  } else {
    db.prepare('UPDATE rides SET status = ?, updated_at = ? WHERE id = ?').run(to, Date.now(), rideId);
  }
  logRideEvent(rideId, ride.status, to, actorId);
  return { ok: true };
}

interface RideRow {
  id: string;
  rider_id: string;
  driver_id: string | null;
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string | null;
  dropoff_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  fare_cents: number | null;
  distance_m: number | null;
  status: RideStatus;
  created_at: number;
  escrow_id: string | null;
  paid: number;
}

export interface RideView {
  id: string;
  status: RideStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string | null;
  dropoff_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  fare_cents: number | null;
  distance_m: number | null;
  created_at: number;
  paid: boolean;
  rider: CommPeer | null;
  driver: CommPeer | null;
}

function rideView(r: RideRow): RideView {
  return {
    id: r.id,
    status: r.status,
    pickup_lat: r.pickup_lat,
    pickup_lng: r.pickup_lng,
    pickup_label: r.pickup_label,
    dropoff_label: r.dropoff_label ?? null,
    dest_lat: r.dest_lat ?? null,
    dest_lng: r.dest_lng ?? null,
    fare_cents: r.fare_cents ?? null,
    distance_m: r.distance_m ?? null,
    created_at: r.created_at,
    paid: !!r.paid,
    rider: commPeer(getUserById(r.rider_id)),
    driver: r.driver_id ? commPeer(getUserById(r.driver_id)) : null,
  };
}

/** Ligne brute d'une course (pour le paiement/escrow) — inclut escrow_id/paid/driver_id. */
export function getRideRow(rideId: string): RideRow | null {
  const r = getDb().prepare('SELECT * FROM rides WHERE id = ?').get(rideId) as RideRow | undefined;
  return r ?? null;
}

/** Marque la course payée + attache l'escrow (séquestre libéré au chauffeur à `terminee`). */
export function setRidePaid(rideId: string, escrowId: string): void {
  getDb().prepare('UPDATE rides SET escrow_id = ?, paid = 1, updated_at = ? WHERE id = ?').run(escrowId, Date.now(), rideId);
}

/** Course active du passager (non terminée/annulée), la plus récente. */
export function getActiveRideForRider(riderId: string): RideView | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM rides WHERE rider_id = ? AND status NOT IN ('terminee','annulee')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(riderId) as RideRow | undefined;
  return r ? rideView(r) : null;
}

/** Demandes en attente pour un chauffeur (ciblées sur lui OU ouvertes). */
export function getDriverRequests(driverId: string): RideView[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM rides WHERE status = 'demandee' AND (driver_id = ? OR driver_id IS NULL)
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(driverId) as RideRow[];
  return rows.map(rideView);
}

/** Course active assignée au chauffeur. */
export function getDriverActiveRide(driverId: string): RideView | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM rides WHERE driver_id = ? AND status IN ('acceptee','en_route','a_bord')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(driverId) as RideRow | undefined;
  return r ? rideView(r) : null;
}

/** Course + position LIVE du chauffeur (pour la carte : on le voit arriver). */
export function getRideLive(rideId: string): { ride: RideView; driver_pos: { lat: number; lng: number } | null } | null {
  const r = getDb().prepare('SELECT * FROM rides WHERE id = ?').get(rideId) as RideRow | undefined;
  if (!r) return null;
  let driver_pos: { lat: number; lng: number } | null = null;
  if (r.driver_id) {
    const d = getDb()
      .prepare('SELECT last_lat, last_lng, last_seen_at FROM drivers WHERE user_id = ?')
      .get(r.driver_id) as { last_lat: number | null; last_lng: number | null; last_seen_at: number | null } | undefined;
    if (d && d.last_lat != null && d.last_lng != null && (d.last_seen_at ?? 0) > Date.now() - DRIVER_STALE_MS) {
      driver_pos = { lat: d.last_lat, lng: d.last_lng };
    }
  }
  return { ride: rideView(r), driver_pos };
}

// ── Adresse de livraison Shop (#429) ──
export interface ShippingAddress {
  full_name: string | null;
  line1: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
}
export function getShippingAddress(userId: string): ShippingAddress | null {
  const r = getDb()
    .prepare('SELECT full_name, line1, city, zip, country, phone FROM shipping_addresses WHERE user_id = ?')
    .get(userId) as ShippingAddress | undefined;
  return r ?? null;
}
export function saveShippingAddress(userId: string, a: ShippingAddress): void {
  getDb()
    .prepare(
      `INSERT INTO shipping_addresses (user_id, full_name, line1, city, zip, country, phone, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         full_name=excluded.full_name, line1=excluded.line1, city=excluded.city,
         zip=excluded.zip, country=excluded.country, phone=excluded.phone, updated_at=excluded.updated_at`
    )
    .run(
      userId,
      a.full_name?.slice(0, 120) ?? null,
      a.line1?.slice(0, 200) ?? null,
      a.city?.slice(0, 80) ?? null,
      a.zip?.slice(0, 20) ?? null,
      a.country?.slice(0, 60) ?? null,
      a.phone?.slice(0, 40) ?? null,
      Date.now()
    );
}

// ── Favori chauffeur (l'anti-Uber) ──
export function addFavoriteDriver(riderId: string, driverId: string): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO favorite_drivers (rider_id, driver_id, created_at) VALUES (?, ?, ?)')
    .run(riderId, driverId, Date.now());
}
export function removeFavoriteDriver(riderId: string, driverId: string): void {
  getDb().prepare('DELETE FROM favorite_drivers WHERE rider_id = ? AND driver_id = ?').run(riderId, driverId);
}
export function getFavoriteDriverIds(riderId: string): string[] {
  return (getDb().prepare('SELECT driver_id FROM favorite_drivers WHERE rider_id = ?').all(riderId) as {
    driver_id: string;
  }[]).map((r) => r.driver_id);
}
export function getFavoriteDrivers(riderId: string): { peer: CommPeer; online: boolean }[] {
  return getFavoriteDriverIds(riderId)
    .map((id) => {
      const peer = commPeer(getUserById(id));
      if (!peer) return null;
      const prof = getDriverProfile(id);
      return { peer, online: !!prof?.is_online };
    })
    .filter((x): x is { peer: CommPeer; online: boolean } => x !== null);
}

