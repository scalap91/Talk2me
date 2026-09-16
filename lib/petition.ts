import 'server-only';
/**
 * Talk2Me — PÉTITION DE GOUVERNANCE anti-capture (Pascal 2026-09-16, spec point par point).
 * On ne dénonce un SUPÉRIEUR (chef/validateur) que COLLECTIVEMENT : 1/3 de sa cohorte, dans une
 * fenêtre de 30 jours, chacun avec SON motif. Au seuil → escalade par rang (chef→validateur,
 * validateur→staff). Verdict : avéré = mesure sur le mis en cause ; calomnie = MÊME mesure sur
 * CHAQUE signataire (retour de bâton). Aucun argent déplacé (moteur mesures = droits/rang).
 * Voir [[project_talk2me_petition_anticapture]]. Phase 1 (ce fichier) = cœur ; SLA/négligence/indispo = Phase 2.
 */
import { getDb } from '@/lib/db';
import { getNetworkDb } from '@/lib/network-db';
import { getContributor } from '@/lib/network';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { applySanction } from '@/lib/sanctions';
import { createNotif } from '@/lib/notifs';
import { randomUUID } from 'crypto';

const WINDOW_MS = 30 * 24 * 3600 * 1000; // fenêtre glissante des signatures
const SLA_MS = 7 * 24 * 3600 * 1000;      // délai avant escalade auto (Phase 2 l'exploitera)

export type PetitionScope = 'chef' | 'validateur';
export interface Petition {
  id: string; target_id: string; scope: PetitionScope; status: string;
  cohort_size: number; threshold: number; created_at: number;
  escalated_at: number | null; sla_deadline: number | null;
  decided_by: string | null; decided_at: number | null; verdict: string | null;
  sanction_level: number | null; decision_note: string | null;
}

let _ready = false;
function ensure() {
  const db = getDb();
  if (_ready) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS petitions (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'collecting',
      cohort_size INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      escalated_at INTEGER, sla_deadline INTEGER,
      decided_by TEXT, decided_at INTEGER, verdict TEXT, sanction_level INTEGER, decision_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_petitions_target ON petitions(target_id, status);
    CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status, escalated_at);
    CREATE TABLE IF NOT EXISTS petition_signatures (
      petition_id TEXT NOT NULL,
      signer_id TEXT NOT NULL,
      motif TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (petition_id, signer_id)
    );
  `);
  _ready = true;
  return db;
}

const nameOf = (id: string): string => {
  try { const u = getDb().prepare('SELECT display_name, username FROM users WHERE id = ?').get(id) as { display_name?: string; username?: string } | undefined; return u?.display_name || u?.username || 'un membre'; } catch { return 'un membre'; }
};

/** Rôle "supérieur" de la cible, ou null si simple membre (→ différend normal, pas de pétition). */
export function targetScope(targetId: string, targetEmail?: string | null): PetitionScope | null {
  if (isAiOpsAdmin(targetId, targetEmail)) return 'validateur';                 // sommet = traité comme validateur+
  if (hasPermission(targetId, targetEmail || '', 'curation_validateur')) return 'validateur';
  const c = getContributor(targetId);
  if (c && c.level_rank >= 3) return 'chef';
  return null;
}

/** La cohorte = la downline DIRECTE de la cible (ceux qu'elle encadre). */
export function cohortMembers(targetId: string): string[] {
  return (getNetworkDb().prepare("SELECT user_id FROM contributors WHERE sponsor_id = ? AND status = 'active'").all(targetId) as { user_id: string }[]).map((r) => r.user_id);
}

function staffIds(): string[] {
  return (process.env.AI_OPS_ADMIN_USER_IDS || process.env.FUZZ_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function validateurIds(): string[] {
  try { return (getDb().prepare("SELECT user_id FROM user_permissions WHERE permission = 'curation_validateur'").all() as { user_id: string }[]).map((r) => r.user_id); } catch { return []; }
}

function notifyEscalation(targetId: string, scope: PetitionScope): void {
  const sname = nameOf(targetId);
  const recipients = scope === 'chef' ? validateurIds() : staffIds();
  const title = scope === 'chef' ? '⚖️ Pétition contre un chef' : '⚖️ Pétition contre un validateur';
  for (const r of recipients) {
    if (r && r !== targetId) createNotif(r, 'gouvernance', title, `Une pétition a atteint le seuil contre ${sname}. À examiner (les faits, puis trancher).`, '/gouvernance/petitions');
  }
}

/**
 * Signer (ou re-signer avec un nouveau motif) la pétition contre un supérieur.
 * Crée la pétition si aucune n'est ouverte. Escalade automatiquement au seuil (1/3, fenêtre 30j).
 */
export function signPetition(signerId: string, targetId: string, motif: string, targetEmail?: string | null): { ok: boolean; error?: string; petition_id?: string; escalated?: boolean; count?: number; threshold?: number } {
  if (!signerId || !targetId) return { ok: false, error: 'params' };
  if (signerId === targetId) return { ok: false, error: 'auto' };
  if (!motif.trim()) return { ok: false, error: 'motif_required' };
  const scope = targetScope(targetId, targetEmail);
  if (!scope) return { ok: false, error: 'cible_non_superieur' };
  const cohort = cohortMembers(targetId);
  if (!cohort.includes(signerId)) return { ok: false, error: 'hors_cohorte' };
  const size = cohort.length;
  const threshold = Math.max(2, Math.ceil(size / 3)); // 1/3, plancher à 2 (jamais "un seul aigri")

  const db = ensure();
  const now = Date.now();
  let p = db.prepare("SELECT * FROM petitions WHERE target_id = ? AND status IN ('collecting','escalated') ORDER BY created_at DESC LIMIT 1").get(targetId) as Petition | undefined;
  if (!p) {
    const id = randomUUID();
    db.prepare("INSERT INTO petitions (id, target_id, scope, status, cohort_size, threshold, created_at) VALUES (?,?,?,?,?,?,?)").run(id, targetId, scope, 'collecting', size, threshold, now);
    p = db.prepare('SELECT * FROM petitions WHERE id = ?').get(id) as Petition;
  } else {
    // rafraîchit la taille de cohorte (elle a pu bouger)
    db.prepare('UPDATE petitions SET cohort_size = ?, threshold = ? WHERE id = ?').run(size, threshold, p.id);
  }
  db.prepare('INSERT OR REPLACE INTO petition_signatures (petition_id, signer_id, motif, created_at) VALUES (?,?,?,?)').run(p.id, signerId, motif.trim().slice(0, 600), now);

  const count = (db.prepare('SELECT COUNT(*) c FROM petition_signatures WHERE petition_id = ? AND created_at >= ?').get(p.id, now - WINDOW_MS) as { c: number }).c;
  let escalated = p.status === 'escalated';
  if (!escalated && count >= threshold) {
    db.prepare("UPDATE petitions SET status = 'escalated', escalated_at = ?, sla_deadline = ? WHERE id = ?").run(now, now + SLA_MS, p.id);
    escalated = true;
    try { notifyEscalation(targetId, scope); } catch { /* notif best-effort */ }
  }
  return { ok: true, petition_id: p.id, escalated, count, threshold };
}

/** chef visé → tranché par un validateur/staff ; validateur visé → tranché par le staff seulement. */
export function canDecide(deciderId: string, deciderEmail: string | null | undefined, p: { scope: PetitionScope; target_id: string }): boolean {
  if (deciderId === p.target_id) return false;
  if (p.scope === 'chef') return isAiOpsAdmin(deciderId, deciderEmail) || hasPermission(deciderId, deciderEmail || '', 'curation_validateur');
  return isAiOpsAdmin(deciderId, deciderEmail);
}

/**
 * Trancher une pétition escaladée. 'founded' → mesure sur le mis en cause.
 * 'dismissed' (calomnie) → RETOUR DE BÂTON : la MÊME mesure sur CHAQUE signataire.
 */
export function decidePetition(deciderId: string, deciderEmail: string | null | undefined, petitionId: string, verdict: 'founded' | 'dismissed', sanctionLevel: number, note?: string): { ok: boolean; error?: string; sanctioned?: number } {
  const db = ensure();
  const p = db.prepare('SELECT * FROM petitions WHERE id = ?').get(petitionId) as Petition | undefined;
  if (!p) return { ok: false, error: 'not_found' };
  if (p.status !== 'escalated') return { ok: false, error: 'not_escalated' };
  if (!canDecide(deciderId, deciderEmail, p)) return { ok: false, error: 'forbidden' };
  const now = Date.now();
  const level = Number(sanctionLevel) || 0;
  let sanctioned = 0;
  if (verdict === 'founded') {
    if (level) { applySanction(p.target_id, level, (note || 'Pétition fondée').slice(0, 400), deciderId); sanctioned = 1; }
  } else {
    // calomnie → sanction commune, même niveau, à chaque signataire (un seul geste)
    if (level) {
      const signers = db.prepare('SELECT signer_id FROM petition_signatures WHERE petition_id = ?').all(petitionId) as { signer_id: string }[];
      const label = `Pétition calomnieuse contre ${nameOf(p.target_id)}`.slice(0, 400);
      for (const s of signers) { applySanction(s.signer_id, level, label, deciderId); sanctioned++; }
    }
  }
  db.prepare('UPDATE petitions SET status = ?, decided_by = ?, decided_at = ?, verdict = ?, sanction_level = ?, decision_note = ? WHERE id = ?')
    .run(verdict === 'founded' ? 'founded' : 'dismissed', deciderId, now, verdict, level || null, (note || '').slice(0, 600), petitionId);
  return { ok: true, sanctioned };
}

export interface PetitionView extends Petition {
  target_name: string;
  count: number;
  signatures: { signer_id: string; signer_name: string; motif: string; created_at: number }[];
}
function enrich(p: Petition): PetitionView {
  const db = ensure();
  const sigs = db.prepare('SELECT signer_id, motif, created_at FROM petition_signatures WHERE petition_id = ? ORDER BY created_at DESC').all(p.id) as { signer_id: string; motif: string; created_at: number }[];
  const fresh = sigs.filter((s) => s.created_at >= Date.now() - WINDOW_MS);
  return { ...p, target_name: nameOf(p.target_id), count: fresh.length, signatures: sigs.map((s) => ({ ...s, signer_name: nameOf(s.signer_id) })) };
}

/** File des pétitions escaladées qu'un décideur donné a le droit de trancher. */
export function listEscalatedFor(deciderId: string, deciderEmail: string | null | undefined): PetitionView[] {
  const rows = ensure().prepare("SELECT * FROM petitions WHERE status = 'escalated' ORDER BY escalated_at DESC LIMIT 50").all() as Petition[];
  return rows.filter((p) => canDecide(deciderId, deciderEmail, p)).map(enrich);
}

/** État de MA pétition-en-cours contre une cible (pour l'UI de signature). */
export function myPetitionState(signerId: string, targetId: string, targetEmail?: string | null): { scope: PetitionScope | null; can_sign: boolean; already: boolean; count: number; threshold: number; status: string | null } {
  const scope = targetScope(targetId, targetEmail);
  const cohort = cohortMembers(targetId);
  const inCohort = cohort.includes(signerId);
  const threshold = Math.max(2, Math.ceil(cohort.length / 3));
  const db = ensure();
  const p = db.prepare("SELECT * FROM petitions WHERE target_id = ? AND status IN ('collecting','escalated') ORDER BY created_at DESC LIMIT 1").get(targetId) as Petition | undefined;
  let count = 0, already = false, status: string | null = null;
  if (p) {
    count = (db.prepare('SELECT COUNT(*) c FROM petition_signatures WHERE petition_id = ? AND created_at >= ?').get(p.id, Date.now() - WINDOW_MS) as { c: number }).c;
    already = !!db.prepare('SELECT 1 FROM petition_signatures WHERE petition_id = ? AND signer_id = ?').get(p.id, signerId);
    status = p.status;
  }
  return { scope, can_sign: !!scope && inCohort && signerId !== targetId, already, count, threshold, status };
}
