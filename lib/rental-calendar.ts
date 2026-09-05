/**
 * LOCAT👀 — MOTEUR DE DISPONIBILITÉ / RÉSERVATION GÉNÉRIQUE (Pascal 2026-09-05).
 * Extrait de lib/rental-planning.ts (location voiture) mais DÉCOUPLÉ des annonces : keyé sur
 * `item_id` (= id d'un shop_product rental=1), owner + prix + unité résolus via
 * getLocatItemForBooking(shop_products), jamais deposit_annonces. Tables locat_* dans shop.db.
 * Un bien louable = robe / sono / bétonnière / voiture… un seul moteur pour tous.
 */
import { randomUUID } from 'node:crypto';
import { getShopDb } from '@/lib/shop-db';
import { getLocatItemForBooking } from '@/lib/db';
import { releaseEscrow } from '@/lib/escrow';

let _init = false;
function db() {
  const d = getShopDb();
  if (!_init) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS locat_availability (
        item_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER,
        PRIMARY KEY (item_id, date)
      );
      CREATE TABLE IF NOT EXISTS locat_bookings (
        id TEXT PRIMARY KEY, item_id TEXT NOT NULL, renter_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        start_date TEXT, end_date TEXT, dates_json TEXT, days INTEGER, total_cents INTEGER,
        status TEXT NOT NULL DEFAULT 'pending', escrow_id TEXT, created_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_locbk_owner ON locat_bookings(owner_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_locbk_renter ON locat_bookings(renter_id, created_at DESC);
    `);
    _init = true;
  }
  return d;
}

// Nombre de jours d'une unité de tarif → total = prix × ceil(jours / unitDays).
const UNIT_DAYS: Record<string, number> = { heure: 1, jour: 1, 'week-end': 2, semaine: 7 };

/** Liste des dates 'YYYY-MM-DD' de start à end inclus (garde-fou 90 jours). */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  for (let d = new Date(s), i = 0; d <= e && i < 90; d.setUTCDate(d.getUTCDate() + 1), i++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Jours indisponibles d'un bien : bloqués par le propriétaire + déjà réservés. */
export function getUnavailableDates(itemId: string): { blocked: string[]; booked: string[] } {
  const rows = db().prepare('SELECT date, status FROM locat_availability WHERE item_id = ?').all(itemId) as Array<{ date: string; status: string }>;
  return { blocked: rows.filter((r) => r.status === 'blocked').map((r) => r.date), booked: rows.filter((r) => r.status === 'booked').map((r) => r.date) };
}

/** Le propriétaire bloque / débloque un jour (jamais un jour déjà 'booked'). */
export function setDayBlocked(ownerId: string, itemId: string, date: string, blocked: boolean): boolean {
  const it = getLocatItemForBooking(itemId);
  if (!it || it.owner_id !== ownerId) return false;
  if (blocked) db().prepare("INSERT OR IGNORE INTO locat_availability (item_id, date, status, created_at) VALUES (?, ?, 'blocked', ?)").run(itemId, date, Date.now());
  else db().prepare("DELETE FROM locat_availability WHERE item_id = ? AND date = ? AND status = 'blocked'").run(itemId, date);
  return true;
}

/** Devis : durée × tarif selon l'unité (jour/semaine/week-end/heure). */
export function priceFor(itemId: string, dates: string[]): { ownerId: string; totalCents: number; periods: number; rateUnit: string; unitPrice: number; deposit: number } | null {
  const it = getLocatItemForBooking(itemId);
  if (!it) return null;
  const unitDays = UNIT_DAYS[it.rate_unit] || 1;
  const periods = Math.max(1, Math.ceil(dates.length / unitDays));
  return { ownerId: it.owner_id, totalCents: (it.price_cents || 0) * periods, periods, rateUnit: it.rate_unit, unitPrice: it.price_cents || 0, deposit: it.deposit || 0 };
}

/** Vérifie qu'aucune date demandée n'est indisponible. */
export function areDatesFree(itemId: string, datesIn: string[]): { ok: boolean; dates: string[]; ownerId?: string } {
  const dates = [...new Set(datesIn.filter(Boolean))].sort();
  const it = getLocatItemForBooking(itemId);
  if (!it || !dates.length) return { ok: false, dates };
  const { blocked, booked } = getUnavailableDates(itemId);
  const unavail = new Set([...blocked, ...booked]);
  if (dates.some((d) => unavail.has(d))) return { ok: false, dates };
  return { ok: true, dates, ownerId: it.owner_id };
}

export interface LocatBooking { id: string; days: number; total_cents: number; owner_id: string; dates: string[] }

/** Crée une réservation (statut 'pending') + marque les jours 'booked'. Le paiement (escrow) suit. */
export function createBooking(renterId: string, itemId: string, datesIn: string[]): { ok: boolean; error?: string; booking?: LocatBooking } {
  const chk = areDatesFree(itemId, datesIn);
  if (!chk.ok || !chk.ownerId) return { ok: false, error: 'dates_unavailable' };
  if (renterId === chk.ownerId) return { ok: false, error: 'self' };
  const pr = priceFor(itemId, chk.dates);
  if (!pr) return { ok: false, error: 'no_item' };
  const id = randomUUID();
  const now = Date.now();
  const tx = db().transaction(() => {
    db().prepare(
      "INSERT INTO locat_bookings (id, item_id, renter_id, owner_id, start_date, end_date, dates_json, days, total_cents, status, created_at) VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?)"
    ).run(id, itemId, renterId, chk.ownerId, chk.dates[0], chk.dates[chk.dates.length - 1], JSON.stringify(chk.dates), chk.dates.length, pr.totalCents, now);
    const ins = db().prepare("INSERT OR REPLACE INTO locat_availability (item_id, date, status, created_at) VALUES (?, ?, 'booked', ?)");
    for (const d of chk.dates) ins.run(itemId, d, now);
  });
  tx();
  return { ok: true, booking: { id, days: chk.dates.length, total_cents: pr.totalCents, owner_id: chk.ownerId, dates: chk.dates } };
}

/**
 * Confirme une réservation APRÈS paiement (statut 'accepted') + marque les jours 'booked'.
 * Appelé par markIntentPaid (comme createConfirmedBooking pour la location voiture). Re-vérifie
 * la disponibilité (anti-course) et lie l'escrow financé. Idempotent-friendly.
 */
export function confirmBooking(renterId: string, itemId: string, dates: string[], totalCents: number, escrowId?: string | null): { ok: boolean; error?: string; booking?: LocatBooking } {
  const chk = areDatesFree(itemId, dates);
  if (!chk.ok || !chk.ownerId) return { ok: false, error: 'dates_unavailable' };
  const id = randomUUID();
  const now = Date.now();
  const tx = db().transaction(() => {
    db().prepare(
      "INSERT INTO locat_bookings (id, item_id, renter_id, owner_id, start_date, end_date, dates_json, days, total_cents, status, escrow_id, created_at) VALUES (?,?,?,?,?,?,?,?,?, 'accepted', ?, ?)"
    ).run(id, itemId, renterId, chk.ownerId, chk.dates[0], chk.dates[chk.dates.length - 1], JSON.stringify(chk.dates), chk.dates.length, totalCents, escrowId ?? null, now);
    const ins = db().prepare("INSERT OR REPLACE INTO locat_availability (item_id, date, status, created_at) VALUES (?, ?, 'booked', ?)");
    for (const d of chk.dates) ins.run(itemId, d, now);
  });
  tx();
  return { ok: true, booking: { id, days: chk.dates.length, total_cents: totalCents, owner_id: chk.ownerId, dates: chk.dates } };
}

export interface BookingRow { id: string; item_id: string; title: string; start_date: string; end_date: string; days: number; total_label: string; status: string; renter_id: string; owner_id: string }

function rowsWhere(clause: string, param: string): BookingRow[] {
  const rs = db().prepare(`SELECT id, item_id, renter_id, owner_id, start_date, end_date, days, total_cents, status FROM locat_bookings WHERE ${clause} ORDER BY created_at DESC`).all(param) as Array<{ id: string; item_id: string; renter_id: string; owner_id: string; start_date: string; end_date: string; days: number; total_cents: number; status: string }>;
  return rs.map((r) => ({ id: r.id, item_id: r.item_id, title: getLocatItemForBooking(r.item_id)?.title || 'Bien retiré', start_date: r.start_date, end_date: r.end_date, days: r.days, total_label: `${Number(r.total_cents).toLocaleString('fr-FR')} Ar`, status: r.status, renter_id: r.renter_id, owner_id: r.owner_id }));
}
/** Mes réservations (locataire). */
export function listRenterBookings(renterId: string): BookingRow[] { return rowsWhere('renter_id = ?', renterId); }
/** Demandes de location reçues (propriétaire). */
export function listOwnerBookings(ownerId: string): BookingRow[] { return rowsWhere('owner_id = ?', ownerId); }

/** Le LOCATAIRE signale que le bien a été rendu. */
export function setReturned(renterId: string, bookingId: string): boolean {
  const r = db().prepare("UPDATE locat_bookings SET status = 'returned' WHERE id = ? AND renter_id = ? AND status IN ('pending','accepted')").run(bookingId, renterId);
  return r.changes > 0;
}

/** Le PROPRIÉTAIRE valide le retour → il ENCAISSE (release de l'escrow financé) + statut 'completed'.
 *  (La caution — quand elle sera collectée en escrow séparé — sera remboursée ici au locataire.) */
export function validateReturn(ownerId: string, bookingId: string): { ok: boolean; error?: string } {
  const b = db().prepare('SELECT id, owner_id, escrow_id, status FROM locat_bookings WHERE id = ? AND owner_id = ?').get(bookingId, ownerId) as { id: string; owner_id: string; escrow_id: string | null; status: string } | undefined;
  if (!b) return { ok: false, error: 'not_found' };
  if (b.status === 'completed') return { ok: true };
  db().prepare("UPDATE locat_bookings SET status = 'completed' WHERE id = ?").run(bookingId);
  if (b.escrow_id) { try { releaseEscrow(b.escrow_id); } catch { /* la validation reste valide même si l'escrow était déjà réglé */ } }
  return { ok: true };
}
