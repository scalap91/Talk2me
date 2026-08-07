import 'server-only';
/**
 * Talk2Me — ÉCHELLE DE SANCTION 1→5 (Pascal 2026-07-27, doctrine gouvernance anti-corruption).
 *
 * Graduée · proportionnelle · déclenchée par la DATA (le casier). Le mérite fait monter, les
 * résultats font tomber. [[project_talk2me_gouvernance_anticorruption]]
 *
 * ⚠️ ÉTAPE #3 — CE FICHIER NE FAIT QUE LA COLONNE VERTÉBRALE : ENREGISTRER / LEVER une sanction
 * (signée, réversible en bas). Il NE DÉCLENCHE AUCUN EFFET argent/droits (geler la commission,
 * status=paused, closeAllRights, bannir). Ces effets = `enforceSanction` (plus bas, NON câblé),
 * à activer NIVEAU PAR NIVEAU sur feu vert de Pascal (ligne rouge argent/droits). Ici : le REGISTRE.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { createNotif } from '@/lib/notifs';
import { sendPushToUser } from '@/lib/push';
import { suspendContributorRole, restoreContributorRole, retractContributorRole } from '@/lib/contributor-rights';

export interface SanctionLevel { level: number; name: string; desc: string; reversible: boolean; neutralConfirm: boolean; touchesMoney: boolean }

/** L'échelle, telle que figée dans la doctrine. `neutralConfirm` = doit être confirmé côté neutre (validateur) + signé. */
export const SANCTION_SCALE: SanctionLevel[] = [
  { level: 1, name: 'Avertissement', desc: 'Rappel éducatif, noté au casier. Signal faible, 1re fois.', reversible: true, neutralConfirm: false, touchesMoney: false },
  { level: 2, name: 'Restriction', desc: 'Plus de boost, visibilité réduite, commission gelée sur le deal.', reversible: true, neutralConfirm: false, touchesMoney: true },
  { level: 3, name: 'Suspension', desc: 'Compte/rôle gelé X jours + rétrogradation d’échelon.', reversible: true, neutralConfirm: false, touchesMoney: true },
  { level: 4, name: 'Retrait du rôle', desc: 'Perte du statut, du réseau/downline, des droits → simple user.', reversible: false, neutralConfirm: true, touchesMoney: true },
  { level: 5, name: 'Bannissement', desc: 'Exclusion définitive, compte fermé.', reversible: false, neutralConfirm: true, touchesMoney: true },
];
export const levelInfo = (n: number) => SANCTION_SCALE.find((s) => s.level === n) || null;

export interface Sanction { id: string; user_id: string; level: number; reason: string; by_user: string; created_at: number; expires_at: number | null; active: number; lifted_at: number | null; lifted_by: string | null }

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sanctions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      level INTEGER NOT NULL,          -- 1..5
      reason TEXT NOT NULL,
      by_user TEXT NOT NULL,           -- SIGNATURE : qui l'a posée (responsabilité → son casier)
      created_at INTEGER NOT NULL,
      expires_at INTEGER,              -- suspension X jours (L3) ; NULL = pas d'échéance
      active INTEGER NOT NULL DEFAULT 1,
      lifted_at INTEGER,
      lifted_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions(user_id, active, created_at DESC);
  `);
  // L3 Suspension : on mémorise l'état d'AVANT (rang + statut du contributeur) pour une levée RÉVERSIBLE exacte.
  for (const col of ['prev_rank INTEGER', 'prev_status TEXT']) {
    try { db.exec(`ALTER TABLE sanctions ADD COLUMN ${col}`); } catch { /* déjà présente */ }
  }
  return db;
}

/** ENREGISTRE une sanction (signée). N'APPLIQUE PAS d'effet argent/droits (cf. enforceSanction, gaté). */
export function applySanction(userId: string, level: number, reason: string, byUser: string, opts?: { expiresAt?: number | null }): { ok: boolean; error?: string; sanction?: Sanction } {
  if (!userId || !byUser) return { ok: false, error: 'params' };
  if (!levelInfo(level)) return { ok: false, error: 'bad_level' };
  if (!reason.trim()) return { ok: false, error: 'reason_required' }; // jamais de sanction sans motif écrit (recours)
  const db = ensure();
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO sanctions (id, user_id, level, reason, by_user, created_at, expires_at, active) VALUES (?,?,?,?,?,?,?,1)')
    .run(id, userId, level, reason.trim().slice(0, 500), byUser, now, opts?.expiresAt ?? null);
  // L3 SUSPENSION — effet DROITS synchrone & réversible (feu vert Pascal 2026-07-28). On GÈLE le rôle
  // (status=paused → gel commission automatique) + rétrograde d'un échelon + révoque les droits élevés.
  // On mémorise l'état d'avant sur la sanction pour une levée EXACTE. AUCUN argent déplacé.
  if (level === 3) {
    const prev = suspendContributorRole(userId, byUser);
    db.prepare('UPDATE sanctions SET prev_rank = ?, prev_status = ? WHERE id = ?').run(prev.prevRank, prev.prevStatus, id);
  }
  // L4 RETRAIT DU RÔLE / L5 BANNISSEMENT — effet DROITS synchrone & IRRÉVERSIBLE (feu vert Pascal 2026-07-28).
  // La personne perd statut + réseau/downline + droits (status='banned', level_rank=1, closeAllRights) → simple user.
  // liftSanction refuse ces niveaux (reversible:false). AUCUN argent déplacé — on ferme des droits, rien n'est encaissé.
  if (level >= 4) retractContributorRole(userId);
  void enforceSanction(userId, level, reason.trim()); // NOTIFIE (safe). L2 lu en direct (isRestricted). L5 ban compte = ci-dessous
  return { ok: true, sanction: { id, user_id: userId, level, reason: reason.trim(), by_user: byUser, created_at: now, expires_at: opts?.expiresAt ?? null, active: 1, lifted_at: null, lifted_by: null } };
}

/**
 * ENFORCEMENT — l'EFFET d'une sanction (le « bras armé »). Câblé NIVEAU PAR NIVEAU sur feu vert de Pascal.
 *  L1 Avertissement = NOTIFIER (notif in-app garantie + push proactif best-effort). ✅ Safe, non-argent.
 *  L2→L5 = argent/droits (geler commission, status paused, closeAllRights, ban) → NON câblés ici (gatés).
 * Fire-and-forget : ne bloque jamais la pose de la sanction.
 */
const SANCTION_NOTIF_TITLE: Record<number, string> = { 1: '⚠ Avertissement', 2: '⛔ Restriction', 3: '🚫 Suspension', 4: '❌ Retrait du rôle', 5: '🔒 Bannissement' };

export async function enforceSanction(userId: string, level: number, reason: string): Promise<void> {
  // NOTIFIER à chaque cran (la personne DOIT savoir) — safe, non-argent.
  const title = SANCTION_NOTIF_TITLE[level] || 'Sanction';
  createNotif(userId, 'sanction', title, reason || 'Décision de la gouvernance — voir ton casier.');
  try { await sendPushToUser(userId, { title, body: (reason || 'Voir ton casier.').slice(0, 140) }); } catch { /* push best-effort */ }
  // L2 = RESTRICTION : lu EN DIRECT via isRestricted() (boost bloqué, commission gelée). ✅ câblé v1791.
  // L3 = SUSPENSION : effet DROITS synchrone dans applySanction (status=paused + rétrograde + révoc droits),
  //   réversible via liftSanction. Gel commission = automatique (garde status!=='active' dans lib/network). ✅ câblé.
  // L4 = RETRAIT DU RÔLE : retractContributorRole dans applySanction (status=banned + rang 1 + closeAllRights),
  //   irréversible. ✅ câblé.
  // L5 = BANNISSEMENT : retrait du rôle (idem L4) + compte fermé — getSessionUser invalide toute session
  //   d'un porteur de sanction active ≥ 5 (accès coupé partout). ✅ câblé.
}

/** RESTREINT = sanction active de niveau ≥ 2. Lu par les gardes-fous : boost bloqué, commission gelée. */
export function isRestricted(userId: string): boolean {
  const s = activeSanction(userId);
  return !!s && s.level >= 2;
}
/** Peut toucher une commission ? Non si restreint (gel L2+). Le (futur) moteur de commission lira ce garde-fou. */
export function canEarnCommission(userId: string): boolean {
  return !isRestricted(userId);
}
/** SUSPENDU = sanction active de niveau ≥ 3 (rôle gelé, échelon rétrogradé). */
export function isSuspended(userId: string): boolean {
  const s = activeSanction(userId);
  return !!s && s.level >= 3;
}

/** LÈVE une sanction (réversible en bas ; L4-L5 irréversibles → refus). Signé. Restaure l'effet L3. */
export function liftSanction(sanctionId: string, byUser: string): { ok: boolean; error?: string } {
  const db = ensure();
  const s = db.prepare('SELECT * FROM sanctions WHERE id = ?').get(sanctionId) as (Sanction & { prev_rank: number | null; prev_status: string | null }) | undefined;
  if (!s) return { ok: false, error: 'not_found' };
  const info = levelInfo(s.level);
  if (info && !info.reversible) return { ok: false, error: 'irreversible' }; // retrait/ban = pas de rétropédalage silencieux
  db.prepare('UPDATE sanctions SET active = 0, lifted_at = ?, lifted_by = ? WHERE id = ?').run(Date.now(), byUser, sanctionId);
  // L3 : on DÉGÈLE le rôle — statut + échelon restaurés à l'exact, droits du rang rouverts.
  if (s.level === 3) restoreContributorRole(s.user_id, s.prev_status, s.prev_rank, byUser);
  return { ok: true };
}

/**
 * RÉCONCILIATION des suspensions EXPIRÉES (« gelé X jours »). Une L3 avec expires_at dépassé n'est plus
 * active (activeSanction l'ignore) mais le contributeur reste `paused` tant qu'on ne le dégèle pas.
 * À appeler au chargement de la gouvernance : dégèle proprement ceux dont la suspension a expiré. Idempotent.
 */
export function reconcileExpiredSuspensions(): number {
  const db = ensure();
  const now = Date.now();
  const expired = db.prepare(
    "SELECT * FROM sanctions WHERE level = 3 AND active = 1 AND expires_at IS NOT NULL AND expires_at <= ?"
  ).all(now) as (Sanction & { prev_rank: number | null; prev_status: string | null })[];
  let n = 0;
  for (const s of expired) {
    db.prepare('UPDATE sanctions SET active = 0, lifted_at = ?, lifted_by = ? WHERE id = ?').run(now, 'system:expiry', s.id);
    restoreContributorRole(s.user_id, s.prev_status, s.prev_rank, 'system:expiry');
    n++;
  }
  return n;
}

/** La sanction ACTIVE la plus lourde (expirée = inactive). null si casier propre. */
export function activeSanction(userId: string): Sanction | null {
  const db = ensure();
  const now = Date.now();
  const s = db.prepare('SELECT * FROM sanctions WHERE user_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY level DESC, created_at DESC LIMIT 1').get(userId, now) as Sanction | undefined;
  return s || null;
}

/** Historique des sanctions d'une personne (pour la gouvernance + le recours). */
export function listSanctions(userId: string): Sanction[] {
  return ensure().prepare('SELECT * FROM sanctions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId) as Sanction[];
}
