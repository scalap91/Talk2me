import 'server-only';
/**
 * Talk2Me — CIRCUIT DE LITIGE (Pascal 2026-07-27, doctrine gouvernance anti-corruption).
 *
 * SÉPARATION DES POUVOIRS, tranchée :
 *  1. Le CHEF DE SECTEUR INSTRUIT (local, connaît les acteurs, peut aller voir) → RAPPORT SIGNÉ. Il n'ENQUÊTE,
 *     il ne DÉCIDE PAS. Mauvaise instruction → retombe sur SON casier (le rapport est signé).
 *  2. Le VALIDATEUR DÉCIDE (neutre, non-commissionné) : remboursement total/partiel + sanction (1→5), sur la
 *     base du rapport. → un commissionné ne décide JAMAIS sur un deal dont il profite. Exclusion (L5) = neutre.
 *
 * ⚠️ NON-ARGENT ici : on enregistre l'instruction + la décision (signées) et on APPLIQUE la sanction (records,
 *    via lib/sanctions — aucun effet). Le REMBOURSEMENT réel (refundEscrow) N'EST PAS exécuté : money = ligne
 *    rouge, décision enregistrée « à exécuter », exécution gatée sur feu vert de Pascal.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { applySanction } from '@/lib/sanctions';
// Étape 4 (Pascal 2026-08-06) : la DÉCISION du validateur exécute l'argent (débranche le « money gaté »).
// full → tout à l'acheteur ; none → libéré au vendeur. Idempotent (l'escrow rejette si déjà réglé).
import { refundEscrow, releaseEscrow } from '@/lib/escrow';

export type LitigeStatus = 'open' | 'instructed' | 'decided';
export type RefundType = 'none' | 'partial' | 'full';

export interface Litige {
  id: string; escrow_id: string | null; subject_id: string; opened_by: string; reason: string;
  status: LitigeStatus; chef_id: string | null; chef_report: string | null; chef_at: number | null;
  validateur_id: string | null; refund_type: RefundType | null; sanction_level: number | null;
  decision_note: string | null; decided_at: number | null; created_at: number;
}

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS litiges (
      id TEXT PRIMARY KEY,
      escrow_id TEXT,
      subject_id TEXT NOT NULL,       -- le mis en cause (souvent le vendeur/prestataire)
      opened_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      chef_id TEXT, chef_report TEXT, chef_at INTEGER,        -- INSTRUCTION signée
      validateur_id TEXT, refund_type TEXT, sanction_level INTEGER, decision_note TEXT, decided_at INTEGER, -- DÉCISION signée
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_litiges_status ON litiges(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_litiges_subject ON litiges(subject_id);
  `);
  return db;
}

/** Ouvre un litige sur un compte (le mis en cause). */
export function openLitige(openedBy: string, subjectId: string, reason: string, escrowId?: string | null): { ok: boolean; error?: string; id?: string } {
  if (!openedBy || !subjectId) return { ok: false, error: 'params' };
  if (!reason.trim()) return { ok: false, error: 'reason_required' };
  const db = ensure();
  const id = randomUUID();
  db.prepare('INSERT INTO litiges (id, escrow_id, subject_id, opened_by, reason, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, escrowId ?? null, subjectId, openedBy, reason.trim().slice(0, 600), 'open', Date.now());
  return { ok: true, id };
}

/** LE CHEF INSTRUIT : dépose son rapport SIGNÉ. Il n'a pas le droit d'instruire un litige qui le vise. */
export function instructLitige(litigeId: string, chefId: string, report: string): { ok: boolean; error?: string } {
  const db = ensure();
  const l = db.prepare('SELECT * FROM litiges WHERE id = ?').get(litigeId) as Litige | undefined;
  if (!l) return { ok: false, error: 'not_found' };
  if (l.status !== 'open') return { ok: false, error: 'not_open' };
  if (l.subject_id === chefId || l.opened_by === chefId) return { ok: false, error: 'juge_et_partie' };
  if (!report.trim()) return { ok: false, error: 'report_required' };
  db.prepare("UPDATE litiges SET status='instructed', chef_id=?, chef_report=?, chef_at=? WHERE id=?")
    .run(chefId, report.trim().slice(0, 2000), Date.now(), litigeId);
  return { ok: true };
}

/** LE VALIDATEUR DÉCIDE (neutre) : remboursement + sanction, sur le rapport. Enregistre + applique la sanction
 *  (record only). Le REMBOURSEMENT n'est PAS exécuté (money gaté) — juste décidé. Le validateur ≠ chef ≠ mis en cause. */
export type MoneyOutcome = 'refunded' | 'released' | 'pending' | 'already_settled' | 'no_escrow' | 'error';
export function decideLitige(litigeId: string, validateurId: string, refundType: RefundType, opts: { sanctionLevel?: number | null; note?: string }): { ok: boolean; error?: string; money?: MoneyOutcome } {
  const db = ensure();
  const l = db.prepare('SELECT * FROM litiges WHERE id = ?').get(litigeId) as Litige | undefined;
  if (!l) return { ok: false, error: 'not_found' };
  if (l.status !== 'instructed') return { ok: false, error: 'not_instructed' }; // pas de décision sans instruction
  if (validateurId === l.chef_id || validateurId === l.subject_id) return { ok: false, error: 'juge_et_partie' };
  const note = (opts.note || '').trim().slice(0, 1000);
  const sl = opts.sanctionLevel && opts.sanctionLevel >= 1 && opts.sanctionLevel <= 5 ? opts.sanctionLevel : null;
  // Sanction = record signé par le validateur (aucun effet argent/droits). Motif = la décision de litige.
  if (sl) applySanction(l.subject_id, sl, note || `Litige : ${l.reason}`.slice(0, 400), validateurId);
  db.prepare("UPDATE litiges SET status='decided', validateur_id=?, refund_type=?, sanction_level=?, decision_note=?, decided_at=? WHERE id=?")
    .run(validateurId, refundType, sl, note || null, Date.now(), litigeId);
  // ARGENT (Étape 4, Pascal 2026-08-06) — exécuté par le VALIDATEUR seul. Best-effort : la décision reste
  // enregistrée même si l'argent ne bouge plus (escrow déjà réglé à la livraison). Idempotent (already_settled).
  let money: MoneyOutcome = 'no_escrow';
  if (l.escrow_id) {
    if (refundType === 'full') { const r = refundEscrow(l.escrow_id); money = r.ok ? 'refunded' : (r.error === 'already_settled' ? 'already_settled' : 'error'); }
    else if (refundType === 'none') { const r = releaseEscrow(l.escrow_id); money = r.ok ? 'released' : (r.error === 'already_settled' ? 'already_settled' : 'error'); }
    else money = 'pending'; // 'partial' : pas de fonction dédiée → montant à préciser, NON versé (honnête).
  }
  return { ok: true, money };
}

export function getLitige(id: string): Litige | null { return (ensure().prepare('SELECT * FROM litiges WHERE id = ?').get(id) as Litige) || null; }
/** Le litige d'une commande (par son escrow) — pour montrer à l'ACHETEUR l'état réel sur sa commande. */
export function getLitigeByEscrow(escrowId: string): Litige | null {
  return (ensure().prepare('SELECT * FROM litiges WHERE escrow_id = ? ORDER BY created_at DESC LIMIT 1').get(escrowId) as Litige) || null;
}
/** Litiges OUVERTS (à instruire par un chef). */
export function listOpen(limit = 50): Litige[] { return ensure().prepare("SELECT * FROM litiges WHERE status='open' ORDER BY created_at DESC LIMIT ?").all(limit) as Litige[]; }
/** Litiges INSTRUITS (à trancher par un validateur). */
export function listInstructed(limit = 50): Litige[] { return ensure().prepare("SELECT * FROM litiges WHERE status='instructed' ORDER BY chef_at DESC LIMIT ?").all(limit) as Litige[]; }
/** Litiges qui visent une personne (casier / recours). */
export function listAbout(userId: string, limit = 50): Litige[] { return ensure().prepare('SELECT * FROM litiges WHERE subject_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Litige[]; }
