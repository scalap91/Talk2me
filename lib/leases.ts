import 'server-only';
/**
 * Talk2Me — LOYER RÉCURRENT SEMI-AUTO (Pascal 2026-06-28).
 * Le mobile money n'a pas de prélèvement auto → on génère les ÉCHÉANCES mensuelles,
 * on relance le locataire (push), et il paie en 1 clic via PaPi chaque mois (escrow
 * vers le bailleur). Doctrine [[project_talk2me_payment_doctrine]] : pas de wallet.
 *
 * Bail = accord bailleur↔locataire (montant mensuel, jour d'échéance, période de début).
 * rent_dues = une échéance par mois (statut due/paid). Génération idempotente.
 */
import { randomUUID } from 'crypto';
import { getAnnoncesDb } from '@/lib/annonces-db';

function db_() { return getAnnoncesDb(); }
let ready = false;
function ensure() {
  if (ready) return;
  const db = db_();
  db.exec(`CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY, landlord_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    title TEXT, monthly_cents INTEGER NOT NULL, day_of_month INTEGER NOT NULL DEFAULT 1,
    start_period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS rent_dues (
    id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, period TEXT NOT NULL,
    amount_cents INTEGER NOT NULL, due_date INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'due', paid_at INTEGER, intent_id TEXT,
    UNIQUE(lease_id, period)
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_leases_user ON leases(tenant_id, landlord_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rent_dues_lease ON rent_dues(lease_id, period);');
  ready = true;
}

export interface Lease { id: string; landlord_id: string; tenant_id: string; title: string | null; monthly_cents: number; day_of_month: number; start_period: string; status: string; created_at: number }
export interface RentDue { id: string; lease_id: string; period: string; amount_cents: number; due_date: number; status: string; paid_at: number | null; intent_id: string | null }

/** 'YYYY-MM' du mois courant. */
function currentPeriod(now = Date.now()): string { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
/** Liste des périodes de start (incl.) au mois courant (incl.), garde-fou 60 mois. */
function periodsUpToNow(startPeriod: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startPeriod.split('-').map((x) => parseInt(x, 10));
  if (!sy || !sm) return out;
  const now = new Date(); const ey = now.getFullYear(); const em = now.getMonth() + 1;
  let y = sy, m = sm, guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; } guard++;
  }
  return out;
}
/** Timestamp d'échéance d'une période 'YYYY-MM' au jour `day`. */
function dueDateOf(period: string, day: number): number {
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const safeDay = Math.min(Math.max(1, day || 1), 28);
  return new Date(y, m - 1, safeDay, 0, 0, 0, 0).getTime();
}

export function createLease(landlordId: string, args: { tenantId: string; title?: string | null; monthlyCents: number; dayOfMonth?: number; startPeriod?: string }): Lease | null {
  ensure();
  if (!args.tenantId || args.tenantId === landlordId) return null;
  const monthly = Math.max(1, Math.round(args.monthlyCents));
  const day = Math.min(Math.max(1, Math.round(args.dayOfMonth || 1)), 28);
  const start = /^\d{4}-\d{2}$/.test(args.startPeriod || '') ? args.startPeriod! : currentPeriod();
  const id = randomUUID();
  db_().prepare('INSERT INTO leases (id, landlord_id, tenant_id, title, monthly_cents, day_of_month, start_period, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, landlordId, args.tenantId, (args.title || '').slice(0, 120) || null, monthly, day, start, 'active', Date.now());
  const lease = getLease(id)!;
  generateDues(lease); // crée les échéances dues jusqu'au mois courant
  return lease;
}

export function getLease(id: string): Lease | null {
  ensure();
  return (db_().prepare('SELECT * FROM leases WHERE id = ?').get(id) as Lease) || null;
}

export function endLease(landlordId: string, leaseId: string): boolean {
  ensure();
  return db_().prepare("UPDATE leases SET status = 'ended' WHERE id = ? AND landlord_id = ?").run(leaseId, landlordId).changes > 0;
}

/** Génère (idempotent) une échéance par mois de start au mois courant. */
export function generateDues(lease: Lease): void {
  ensure();
  const ins = db_().prepare("INSERT OR IGNORE INTO rent_dues (id, lease_id, period, amount_cents, due_date, status) VALUES (?, ?, ?, ?, ?, 'due')");
  for (const p of periodsUpToNow(lease.start_period)) {
    ins.run(randomUUID(), lease.id, p, lease.monthly_cents, dueDateOf(p, lease.day_of_month));
  }
}

export function listLeasesForUser(userId: string): Lease[] {
  ensure();
  return db_().prepare("SELECT * FROM leases WHERE (tenant_id = ? OR landlord_id = ?) AND status = 'active' ORDER BY created_at DESC").all(userId, userId) as Lease[];
}

export function listDues(leaseId: string): RentDue[] {
  ensure();
  return db_().prepare('SELECT * FROM rent_dues WHERE lease_id = ? ORDER BY period DESC').all(leaseId) as RentDue[];
}

/** Infos pour payer une échéance (montant + bailleur + statut). */
export function getDueForPay(dueId: string): { due: RentDue; lease: Lease } | null {
  ensure();
  const due = db_().prepare('SELECT * FROM rent_dues WHERE id = ?').get(dueId) as RentDue | undefined;
  if (!due) return null;
  const lease = getLease(due.lease_id);
  if (!lease) return null;
  return { due, lease };
}

/** Marque une échéance PAYÉE (appelé au callback PaPi). Idempotent. */
export function markDuePaid(dueId: string, intentId?: string | null): boolean {
  ensure();
  return db_().prepare("UPDATE rent_dues SET status = 'paid', paid_at = ?, intent_id = COALESCE(?, intent_id) WHERE id = ? AND status != 'paid'")
    .run(Date.now(), intentId ?? null, dueId).changes > 0;
}

/** Échéances impayées (pour relance + watchdog). active leases only. */
export function listUnpaidDues(): Array<RentDue & { landlord_id: string; tenant_id: string; title: string | null }> {
  ensure();
  return db_().prepare(
    `SELECT d.*, l.landlord_id, l.tenant_id, l.title FROM rent_dues d JOIN leases l ON l.id = d.lease_id
      WHERE d.status = 'due' AND l.status = 'active' ORDER BY d.due_date ASC`
  ).all() as Array<RentDue & { landlord_id: string; tenant_id: string; title: string | null }>;
}

/** Génère les échéances du mois courant pour tous les baux actifs (cron). */
export function generateAllDuesNow(): number {
  ensure();
  const leases = db_().prepare("SELECT * FROM leases WHERE status = 'active'").all() as Lease[];
  for (const l of leases) generateDues(l);
  return leases.length;
}
