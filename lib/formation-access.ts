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
  // « ENVOYER EN FORMATION » (Pascal 2026-08-08) : un CONTRIBUTEUR envoie une recrue en formation.
  // On mémorise QUI l'a envoyée → à la CERTIFICATION, la recrue devient son filleul (boucle fermée).
  // Table séparée (le validateur crée sa propre ligne d'accès ; on ne veut pas la piétiner). Premier-envoyeur gagne.
  db.exec(`
    CREATE TABLE IF NOT EXISTS formation_sent (
      recrue_id TEXT PRIMARY KEY,
      sent_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_formation_sent_by ON formation_sent(sent_by, created_at DESC);
  `);
  // ROUTAGE PAR ZONE (Pascal 2026-08-08, choix A) : on fige la VILLE de la recrue au moment de l'envoi
  // (= la ville du contributeur qui l'a recrutée localement) → elle apparaît chez les validateurs de CETTE ville.
  try { db.exec('ALTER TABLE formation_sent ADD COLUMN city TEXT'); } catch { /* déjà là */ }
  return db;
}

/** Un CONTRIBUTEUR envoie une recrue en formation. Idempotent : garde le PREMIER envoyeur.
 *  `city` = zone de routage (ville du contributeur). Null = zone inconnue → visible par tous les validateurs. */
export function sendToFormation(recrueId: string, byContributor: string, city?: string | null): void {
  ensure().prepare('INSERT OR IGNORE INTO formation_sent (recrue_id, sent_by, created_at, city) VALUES (?,?,?,?)')
    .run(recrueId, byContributor, Date.now(), city || null);
}

/** Les VILLES qui ont au moins un validateur (droit `curation_validateur` + une ville de contributeur).
 *  Sert au repli anti-trou : une zone SANS validateur retombe chez tous. */
function coveredCities(): Set<string> {
  const rows = ensure().prepare(`
    SELECT DISTINCT c.city AS city
    FROM user_permissions up JOIN contributors c ON c.user_id = up.user_id
    WHERE up.permission = 'curation_validateur' AND c.city IS NOT NULL AND c.city != ''
  `).all() as { city: string }[];
  return new Set(rows.map((r) => r.city));
}

/** FILE D'ARRIVÉE d'un validateur : les recrues ENVOYÉES en formation, pas encore prises en charge.
 *  Routage par ZONE (Pascal 2026-08-08) avec REPLI : ma ville → à moi ; ville inconnue → à tous ;
 *  ville NON COUVERTE par un validateur → retombe chez tous (zone voisine/couverte la récupère) ;
 *  ville couverte par SON propre validateur → pas à moi (sauf si je n'ai pas de ville = national/admin). */
export function listFormationInbox(validateurCity: string | null): { recrue_id: string; sent_by: string; city: string | null; created_at: number }[] {
  const covered = coveredCities();
  const rows = ensure().prepare('SELECT recrue_id, sent_by, city, created_at FROM formation_sent ORDER BY created_at ASC')
    .all() as { recrue_id: string; sent_by: string; city: string | null; created_at: number }[];
  return rows.filter((r) => {
    if (getFormationAccess(r.recrue_id)) return false;              // déjà prise en charge
    if (!r.city) return true;                                       // zone inconnue → visible par tous
    if (validateurCity && r.city === validateurCity) return true;   // ma zone
    if (!covered.has(r.city)) return true;                          // zone NON couverte → retombe chez tous
    return !validateurCity;                                         // zone couverte ailleurs : je la vois seulement si je suis sans ville (national)
  });
}
/** Qui a envoyé cette recrue en formation (le contributeur à qui elle revient à la certification). */
export function getFormationSender(recrueId: string): string | null {
  const r = ensure().prepare('SELECT sent_by FROM formation_sent WHERE recrue_id = ?').get(recrueId) as { sent_by: string } | undefined;
  return r?.sent_by || null;
}
/** Les recrues qu'un contributeur a envoyées en formation (pour son suivi). */
export function listSentToFormation(contributorId: string): string[] {
  return (ensure().prepare('SELECT recrue_id FROM formation_sent WHERE sent_by = ? ORDER BY created_at DESC').all(contributorId) as { recrue_id: string }[]).map((r) => r.recrue_id);
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
