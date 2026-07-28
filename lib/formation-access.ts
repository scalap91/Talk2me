/**
 * Talk2Me — Accès à la formation (Pascal 2026-07-27). Doctrine : c'est le VALIDATEUR qui OUVRE
 * l'accès à la formation lors de ses sessions (il connaît le taf + il est neutre). L'accès ne
 * dépend donc PAS de « avoir rejoint le réseau » : il est OUVERT par un validateur, signé et daté.
 * Deux états : accès OUVERT (voit le matériel) puis CERTIFIÉ (badge « connaît le taf » → peut agir).
 */
import { getDb } from '@/lib/db';

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS contributor_formation_access (
      user_id TEXT PRIMARY KEY,
      opened_by TEXT NOT NULL,        -- le validateur qui a ouvert l'accès (signature)
      opened_at INTEGER NOT NULL,
      session TEXT,                    -- libellé de session (ex. « Antananarivo · 27/07 »)
      certified_at INTEGER,            -- badge « connaît le taf » posé
      certified_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_formacc_by ON contributor_formation_access(opened_by);
  `);
  // Examen de fin : score + réussite (colonnes ajoutées après coup).
  for (const sql of [
    'ALTER TABLE contributor_formation_access ADD COLUMN quiz_score INTEGER',
    'ALTER TABLE contributor_formation_access ADD COLUMN quiz_at INTEGER',
    'ALTER TABLE contributor_formation_access ADD COLUMN quiz_passed INTEGER',
  ]) { try { db.exec(sql); } catch { /* colonne déjà là */ } }
  return db;
}

/** Enregistre le résultat de l'examen du recruté (sur sa ligne d'accès). */
export function setQuizResult(userId: string, score: number, passed: boolean): void {
  ensure().prepare('UPDATE contributor_formation_access SET quiz_score = ?, quiz_passed = ?, quiz_at = ? WHERE user_id = ?')
    .run(score, passed ? 1 : 0, Date.now(), userId);
}
export function quizPassed(userId: string): boolean {
  const r = ensure().prepare('SELECT quiz_passed FROM contributor_formation_access WHERE user_id = ?').get(userId) as { quiz_passed: number | null } | undefined;
  return !!(r && r.quiz_passed);
}

export function hasFormationAccess(userId: string): boolean {
  return !!ensure().prepare('SELECT 1 FROM contributor_formation_access WHERE user_id = ?').get(userId);
}

export function isCertified(userId: string): boolean {
  const r = ensure().prepare('SELECT certified_at FROM contributor_formation_access WHERE user_id = ?').get(userId) as { certified_at: number | null } | undefined;
  return !!(r && r.certified_at);
}

export interface FormationAccess { user_id: string; opened_by: string; opened_at: number; session: string | null; certified_at: number | null; certified_by: string | null }
export function getFormationAccess(userId: string): FormationAccess | null {
  return (ensure().prepare('SELECT * FROM contributor_formation_access WHERE user_id = ?').get(userId) as FormationAccess) || null;
}

/** Un VALIDATEUR ouvre l'accès à un recruté (lors de sa session). Idempotent (conserve la 1re ouverture). */
export function openFormationAccess(userId: string, byValidateur: string, session?: string): void {
  const db = ensure();
  if (db.prepare('SELECT 1 FROM contributor_formation_access WHERE user_id = ?').get(userId)) return;
  db.prepare('INSERT INTO contributor_formation_access (user_id, opened_by, opened_at, session) VALUES (?,?,?,?)')
    .run(userId, byValidateur, Date.now(), session || null);
}

/** Un VALIDATEUR pose le badge « connaît le taf » (certification). Ouvre l'accès si pas déjà fait. */
export function certifyFormation(userId: string, byValidateur: string, session?: string): void {
  openFormationAccess(userId, byValidateur, session);
  ensure().prepare('UPDATE contributor_formation_access SET certified_at = ?, certified_by = ? WHERE user_id = ?')
    .run(Date.now(), byValidateur, userId);
}

/** Retirer l'accès (ex. erreur). */
export function revokeFormationAccess(userId: string): void {
  ensure().prepare('DELETE FROM contributor_formation_access WHERE user_id = ?').run(userId);
}

/** La cohorte d'un validateur : les recrutés à qui IL a ouvert l'accès (avec nom). */
export function listCohort(validateurId: string): { user_id: string; name: string; session: string | null; opened_at: number; certified: boolean }[] {
  return (ensure().prepare(`
    SELECT fa.user_id, COALESCE(u.display_name, u.username) AS name, fa.session, fa.opened_at, fa.certified_at
    FROM contributor_formation_access fa JOIN users u ON u.id = fa.user_id
    WHERE fa.opened_by = ? ORDER BY fa.opened_at DESC
  `).all(validateurId) as { user_id: string; name: string; session: string | null; opened_at: number; certified_at: number | null }[])
    .map((r) => ({ user_id: r.user_id, name: r.name || 'Recruté', session: r.session, opened_at: r.opened_at, certified: !!r.certified_at }));
}
