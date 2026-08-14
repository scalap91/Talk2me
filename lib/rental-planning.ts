import 'server-only';
/**
 * Talk2Me — Planning de location de véhicule (Pascal 2026-06-26, Phase 1).
 * Le propriétaire gère la DISPONIBILITÉ de son annonce Véhicules « location » :
 * il bloque/débloque des jours (entretien, usage perso…). Stocké dans annonces.db
 * (même base que les annonces → extractible). Phase 2 ajoutera les réservations.
 */
import { randomUUID } from 'crypto';
import { getAnnoncesDb } from '@/lib/annonces-db';
import { formatMoney, MARKET_CURRENCY } from '@/lib/money';
import { getUserById, addWalletTransaction } from '@/lib/db';
import { disburse } from '@/lib/payout';
import { releaseFieldCommission, reverseFieldCommissionByOrderRef } from '@/lib/network';
import { PLATFORM_USER_ID, refundEscrow } from '@/lib/escrow';

let _init = false;
function ensure() {
  const db = getAnnoncesDb();
  if (!_init) {
    db.exec(`CREATE TABLE IF NOT EXISTS rental_availability (
      annonce_id TEXT NOT NULL,
      date TEXT NOT NULL,                 -- 'YYYY-MM-DD'
      status TEXT NOT NULL DEFAULT 'blocked',  -- 'blocked' | 'booked'
      created_at INTEGER NOT NULL,
      PRIMARY KEY (annonce_id, date)
    );`);
    db.exec(`CREATE TABLE IF NOT EXISTS rental_bookings (
      id TEXT PRIMARY KEY,
      annonce_id TEXT NOT NULL,
      renter_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | refused | cancelled
      created_at INTEGER NOT NULL
    );`);
    // dates_json = liste EXACTE des jours réservés (gère les réservations NON-contiguës :
    // ex. 3 jours semaine 1 + 4 jours semaine 2). start/end gardés pour l'affichage.
    try { db.exec("ALTER TABLE rental_bookings ADD COLUMN dates_json TEXT"); } catch { /* déjà */ }
    // Heure de prise + heure de retour (Pascal 2026-06-26). Retour = même heure que la prise
    // (le locataire peut rendre avant ; après = pénalité). 'HH:MM'.
    try { db.exec("ALTER TABLE rental_bookings ADD COLUMN pickup_time TEXT"); } catch { /* déjà */ }
    try { db.exec("ALTER TABLE rental_bookings ADD COLUMN return_time TEXT"); } catch { /* déjà */ }
    // escrow_id : l'escrow financé de CETTE réservation (Pascal 2026-08-13) → sert au REMBOURSEMENT
    // exact si la location payée est ANNULÉE avant le début (refundEscrow ciblé).
    try { db.exec("ALTER TABLE rental_bookings ADD COLUMN escrow_id TEXT"); } catch { /* déjà */ }
    // Échéancier de REVERSEMENT (settlement) : 1 ligne par jour de location. Le règlement
    // est libéré au propriétaire JOUR PAR JOUR (dès la récupération) → décaissement auto.
    db.exec(`CREATE TABLE IF NOT EXISTS rental_settlements (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      date TEXT NOT NULL,                -- jour de location à libérer (= date de récupération de cette journée)
      amount_cents INTEGER NOT NULL,     -- part du jour pour le propriétaire (net commission)
      status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | released
      released_at INTEGER,
      created_at INTEGER NOT NULL
    );`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_rental_settle_due ON rental_settlements(status, date);");
    _init = true;
  }
  return db;
}

/** Liste des dates 'YYYY-MM-DD' de start à end inclus (garde-fou 90 jours). */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return out;
  for (let t = s; t <= e && out.length < 90; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function ownsRental(db: ReturnType<typeof getAnnoncesDb>, annonceId: string, ownerId: string): boolean {
  const r = db.prepare("SELECT user_id FROM deposit_annonces WHERE id = ? AND rental = 1").get(annonceId) as { user_id: string } | undefined;
  return !!r && r.user_id === ownerId;
}

export interface MyRental { id: string; title: string; image_url: string | null; city: string | null; price_label: string | null; driver_option: string | null }
export function listMyRentals(ownerId: string): MyRental[] {
  const db = ensure();
  const rows = db.prepare(
    "SELECT id, title, image_url, city, price_cents, driver_option FROM deposit_annonces WHERE user_id = ? AND rental = 1 ORDER BY updated_at DESC"
  ).all(ownerId) as Array<{ id: string; title: string; image_url: string | null; city: string | null; price_cents: number | null; driver_option: string | null }>;
  return rows.map((r) => ({
    id: r.id, title: r.title, image_url: r.image_url, city: r.city,
    price_label: typeof r.price_cents === 'number' ? formatMoney(r.price_cents) : null,
    driver_option: r.driver_option ?? null,
  }));
}

/** Jours indisponibles d'un véhicule (bloqués par le proprio ; Phase 2 : + réservés). */
export function getUnavailableDates(annonceId: string): { blocked: string[]; booked: string[] } {
  const db = ensure();
  const rows = db.prepare("SELECT date, status FROM rental_availability WHERE annonce_id = ?").all(annonceId) as Array<{ date: string; status: string }>;
  return {
    blocked: rows.filter((r) => r.status === 'blocked').map((r) => r.date),
    booked: rows.filter((r) => r.status === 'booked').map((r) => r.date),
  };
}

/** Bloque/débloque un jour (proprio uniquement). Retourne false si non-propriétaire/date invalide. */
export function setDayBlocked(ownerId: string, annonceId: string, date: string, blocked: boolean): boolean {
  const db = ensure();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!ownsRental(db, annonceId, ownerId)) return false;
  if (blocked) {
    db.prepare("INSERT OR IGNORE INTO rental_availability (annonce_id, date, status, created_at) VALUES (?, ?, 'blocked', ?)").run(annonceId, date, Date.now());
  } else {
    // On ne déverrouille QUE les jours bloqués par le proprio, jamais un 'booked'.
    db.prepare("DELETE FROM rental_availability WHERE annonce_id = ? AND date = ? AND status = 'blocked'").run(annonceId, date);
  }
  return true;
}

// ===================== Phase 2 — RÉSERVATIONS =====================

export interface BookingResult { ok: boolean; error?: string; booking?: { id: string; days: number; total_label: string; owner_id: string } }

/** Le locataire demande une réservation sur une LISTE de jours (contigus OU non). */
export function createBooking(renterId: string, annonceId: string, datesIn: string[]): BookingResult {
  const db = ensure();
  // dédoublonne + valide le format + trie
  const dates = [...new Set((datesIn || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!dates.length || dates.length > 90) return { ok: false, error: 'bad_dates' };
  const a = db.prepare("SELECT user_id, price_cents, status FROM deposit_annonces WHERE id = ? AND rental = 1").get(annonceId) as { user_id: string; price_cents: number | null; status: string } | undefined;
  if (!a || a.status !== 'published') return { ok: false, error: 'not_found' };
  if (a.user_id === renterId) return { ok: false, error: 'own_listing' };
  const { blocked, booked } = getUnavailableDates(annonceId);
  const unavail = new Set([...blocked, ...booked]);
  if (dates.some((d) => unavail.has(d))) return { ok: false, error: 'dates_unavailable' };
  const days = dates.length;
  const total = Math.max(0, (a.price_cents || 0)) * days;
  const id = randomUUID();
  db.prepare(
    "INSERT INTO rental_bookings (id, annonce_id, renter_id, owner_id, start_date, end_date, days, total_cents, status, dates_json, created_at) VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)"
  ).run(id, annonceId, renterId, a.user_id, dates[0], dates[dates.length - 1], days, total, JSON.stringify(dates), Date.now());
  return { ok: true, booking: { id, days, total_label: formatMoney(total), owner_id: a.user_id } };
}

/** Vérifie que TOUS ces jours sont libres pour cette annonce (avant de débiter). */
export function areDatesFree(annonceId: string, datesIn: string[]): { ok: boolean; dates: string[]; ownerId?: string; priceCents?: number } {
  const db = ensure();
  const dates = [...new Set((datesIn || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!dates.length || dates.length > 90) return { ok: false, dates: [] };
  const a = db.prepare("SELECT user_id, price_cents, status FROM deposit_annonces WHERE id = ? AND rental = 1").get(annonceId) as { user_id: string; price_cents: number | null; status: string } | undefined;
  if (!a || a.status !== 'published') return { ok: false, dates };
  const { blocked, booked } = getUnavailableDates(annonceId);
  const unavail = new Set([...blocked, ...booked]);
  if (dates.some((d) => unavail.has(d))) return { ok: false, dates };
  return { ok: true, dates, ownerId: a.user_id, priceCents: Math.max(0, a.price_cents || 0) };
}

/** Crée une réservation CONFIRMÉE (après paiement) : statut 'accepted' + jours marqués 'booked'.
 *  Pas d'approbation propriétaire — il paye, c'est réservé, le proprio est informé. */
export function createConfirmedBooking(renterId: string, annonceId: string, datesIn: string[], totalCents: number, pickupTime?: string | null, escrowId?: string | null): { ok: boolean; error?: string; booking?: { id: string; days: number; total_label: string; owner_id: string; dates: string[] } } {
  const db = ensure();
  const chk = areDatesFree(annonceId, datesIn);
  if (!chk.ok || !chk.ownerId) return { ok: false, error: 'dates_unavailable' };
  if (chk.ownerId === renterId) return { ok: false, error: 'own_listing' };
  const dates = chk.dates;
  const time = /^\d{1,2}:\d{2}$/.test(String(pickupTime || '')) ? String(pickupTime) : null; // retour = même heure
  const id = randomUUID();
  const now = Date.now();
  const insBooked = db.prepare("INSERT OR REPLACE INTO rental_availability (annonce_id, date, status, created_at) VALUES (?, ?, 'booked', ?)");
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO rental_bookings (id, annonce_id, renter_id, owner_id, start_date, end_date, days, total_cents, status, dates_json, pickup_time, return_time, escrow_id, created_at) VALUES (?,?,?,?,?,?,?,?, 'accepted', ?, ?, ?, ?, ?)")
      .run(id, annonceId, renterId, chk.ownerId, dates[0], dates[dates.length - 1], dates.length, totalCents, JSON.stringify(dates), time, time, escrowId ?? null, now);
    for (const d of dates) insBooked.run(annonceId, d, now);
  });
  tx();
  return { ok: true, booking: { id, days: dates.length, total_label: formatMoney(totalCents), owner_id: chk.ownerId, dates } };
}

export interface OwnerBooking {
  id: string; annonce_id: string; vehicle_title: string; start_date: string; end_date: string;
  days: number; total_label: string; status: string;
  pickup_time: string | null; return_time: string | null;
  renter: { username: string; display_name: string | null } | null;
}
/** Demandes de réservation reçues par le propriétaire (pending d'abord). */
export function listOwnerBookings(ownerId: string): OwnerBooking[] {
  const db = ensure();
  const rows = db.prepare(
    `SELECT b.*, a.title AS vehicle_title FROM rental_bookings b
       JOIN deposit_annonces a ON a.id = b.annonce_id
      WHERE b.owner_id = ? AND b.status IN ('pending','accepted')
      ORDER BY (b.status='pending') DESC, b.created_at DESC LIMIT 100`
  ).all(ownerId) as Array<{ id: string; annonce_id: string; vehicle_title: string; renter_id: string; start_date: string; end_date: string; days: number; total_cents: number; status: string; pickup_time?: string | null; return_time?: string | null }>;
  return rows.map((r) => {
    let renter: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.renter_id); if (u) renter = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    return { id: r.id, annonce_id: r.annonce_id, vehicle_title: r.vehicle_title, start_date: r.start_date, end_date: r.end_date, days: r.days, total_label: formatMoney(r.total_cents), status: r.status, pickup_time: r.pickup_time ?? null, return_time: r.return_time ?? null, renter };
  });
}

/** Le propriétaire accepte/refuse une demande. Accept → marque les jours 'booked'. */
export function setBookingStatus(ownerId: string, bookingId: string, action: 'accept' | 'refuse'): boolean {
  const db = ensure();
  const b = db.prepare("SELECT * FROM rental_bookings WHERE id = ? AND owner_id = ?").get(bookingId, ownerId) as { id: string; annonce_id: string; start_date: string; end_date: string; status: string; dates_json?: string | null } | undefined;
  if (!b || b.status !== 'pending') return false;
  if (action === 'refuse') {
    db.prepare("UPDATE rental_bookings SET status = 'refused' WHERE id = ?").run(bookingId);
    return true;
  }
  // accept : vérifie que les jours sont toujours libres, puis les marque 'booked'.
  // dates_json = liste exacte (non-contiguë) ; fallback plage start..end pour anciennes lignes.
  const { blocked, booked } = getUnavailableDates(b.annonce_id);
  const unavail = new Set([...blocked, ...booked]);
  let dates: string[] = [];
  try { if (b.dates_json) dates = JSON.parse(b.dates_json); } catch { /* */ }
  if (!dates.length) dates = eachDate(b.start_date, b.end_date);
  if (dates.some((d) => unavail.has(d))) return false; // entre-temps pris/bloqué
  const now = Date.now();
  const ins = db.prepare("INSERT OR REPLACE INTO rental_availability (annonce_id, date, status, created_at) VALUES (?, ?, 'booked', ?)");
  const tx = db.transaction(() => {
    for (const d of dates) ins.run(b.annonce_id, d, now);
    db.prepare("UPDATE rental_bookings SET status = 'accepted' WHERE id = ?").run(bookingId);
  });
  tx();
  return true;
}

/**
 * ANNULE une location PAYÉE (Pascal 2026-08-13), AVANT le début (aucun jour encore réglé) :
 *  - rembourse le LOCATAIRE (refundEscrow de l'escrow financé de la réservation) ;
 *  - annule l'échéancier de reversement propriétaire (jours 'scheduled' → 'cancelled') ;
 *  - REPREND la commission référent (order_ref = booking id → pending→'reversed', rien versé) ;
 *  - LIBÈRE les jours (rental_availability) ; passe la réservation 'cancelled'.
 * Autorisé au LOCATAIRE ou au PROPRIÉTAIRE. Refuse si un jour a déjà été réglé (location commencée
 * → remboursement partiel = flux séparé, non couvert ici).
 */
export function cancelPaidRental(bookingId: string, byUserId: string): { ok: boolean; error?: string; refunded?: boolean } {
  const db = ensure();
  const b = db.prepare("SELECT * FROM rental_bookings WHERE id = ?").get(bookingId) as
    { id: string; annonce_id: string; renter_id: string; owner_id: string; status: string; dates_json?: string | null; start_date: string; end_date: string; escrow_id?: string | null } | undefined;
  if (!b) return { ok: false, error: 'not_found' };
  if (byUserId !== b.renter_id && byUserId !== b.owner_id) return { ok: false, error: 'forbidden' };
  if (b.status !== 'accepted') return { ok: false, error: 'not_cancellable' };
  const releasedDays = (db.prepare("SELECT COUNT(*) c FROM rental_settlements WHERE booking_id = ? AND status = 'released'").get(bookingId) as { c: number }).c;
  if (releasedDays > 0) return { ok: false, error: 'already_started' };
  // 1) échéancier restant annulé + 2) jours libérés + 3) réservation annulée (atomique, base annonces).
  let dates: string[] = [];
  try { if (b.dates_json) dates = JSON.parse(b.dates_json); } catch { /* */ }
  if (!dates.length) dates = eachDate(b.start_date, b.end_date);
  const delAvail = db.prepare("DELETE FROM rental_availability WHERE annonce_id = ? AND date = ? AND status = 'booked'");
  db.transaction(() => {
    db.prepare("UPDATE rental_settlements SET status = 'cancelled' WHERE booking_id = ? AND status = 'scheduled'").run(bookingId);
    for (const d of dates) delAvail.run(b.annonce_id, d);
    db.prepare("UPDATE rental_bookings SET status = 'cancelled' WHERE id = ?").run(bookingId);
  })();
  // 4) REPREND la commission référent (network.db) — order_ref = booking id.
  try { reverseFieldCommissionByOrderRef(bookingId, 'rental_cancelled'); } catch { /* best-effort */ }
  // 5) REMBOURSE le locataire (escrow financé, base principale). Best-effort : l'annulation reste valide.
  let refunded = false;
  if (b.escrow_id) { try { refunded = !!refundEscrow(b.escrow_id).ok; } catch { /* */ } }
  return { ok: true, refunded };
}

// ===================== Phase 3 — REVERSEMENT AUTO (jour par jour) =====================

/** Crée l'échéancier de reversement : 1 ligne par jour (part nette du propriétaire). */
export function scheduleSettlement(bookingId: string, ownerId: string, dates: string[], ownerTotalCents: number): void {
  const db = ensure();
  const n = dates.length;
  if (!n || ownerTotalCents <= 0) return;
  const base = Math.floor(ownerTotalCents / n);
  const now = Date.now();
  const ins = db.prepare("INSERT INTO rental_settlements (id, booking_id, owner_id, date, amount_cents, status, created_at) VALUES (?,?,?,?,?, 'scheduled', ?)");
  const tx = db.transaction(() => {
    dates.forEach((d, i) => {
      const amt = i === n - 1 ? ownerTotalCents - base * (n - 1) : base; // dernier jour = reste (somme exacte)
      ins.run(randomUUID(), bookingId, ownerId, d, amt, now);
    });
  });
  tx();
}

/** Libère (décaisse) automatiquement les jours échus (date <= aujourd'hui). Idempotent.
 *  À appeler par un cron quotidien (/api/cron/rental-settle). */
export async function releaseDueSettlements(nowMs = Date.now()): Promise<{ released: number; total: number }> {
  const db = ensure();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const due = db.prepare("SELECT * FROM rental_settlements WHERE status = 'scheduled' AND date <= ? ORDER BY date ASC LIMIT 500")
    .all(today) as Array<{ id: string; booking_id: string; owner_id: string; date: string; amount_cents: number }>;
  let released = 0;
  const touched = new Set<string>();
  for (const s of due) {
    const r = await disburse({ userId: s.owner_id, amountCents: s.amount_cents, currency: MARKET_CURRENCY, label: `Location — jour ${s.date}`, ref: `rental_day:${s.booking_id}:${s.date}` });
    if (r.ok) { db.prepare("UPDATE rental_settlements SET status = 'released', released_at = ? WHERE id = ?").run(Date.now(), s.id); released++; touched.add(s.booking_id); }
  }
  // LOCATION CONCLUE (Pascal 2026-08-13) : quand une réservation n'a PLUS aucun jour 'scheduled', la
  // commission référent (order_ref = booking id) est LIBÉRÉE au wallet — référent + override — tirée de
  // la plateforme, comme les flux escrow. Best-effort + idempotent : ne casse jamais le décaissement.
  for (const bookingId of touched) {
    try {
      const remaining = (db.prepare("SELECT COUNT(*) c FROM rental_settlements WHERE booking_id = ? AND status = 'scheduled'").get(bookingId) as { c: number }).c;
      if (remaining > 0) continue; // pas encore entièrement réglée
      for (const l of releaseFieldCommission(bookingId)) {
        addWalletTransaction(l.contributor_id, l.amount_cents, 'commission', 'Commission référent (location)', Date.now(), bookingId, MARKET_CURRENCY);
        addWalletTransaction(PLATFORM_USER_ID, -l.amount_cents, 'commission', 'Reversement commission référent (location)', Date.now(), bookingId, MARKET_CURRENCY);
      }
    } catch { /* la commission ne casse pas le décaissement */ }
  }
  return { released, total: due.length };
}
