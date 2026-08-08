import 'server-only';
/**
 * Talk2Me — L'ÉCHELLE QUI DESCEND (Pascal 2026-08-08, étape #3 du casier anti-corruption).
 * Le casier (lib/casier) ALERTE (green/orange/red) ; ici on APPLIQUE la conséquence AUTO :
 *   rouge → gel du rôle + descente d'UN échelon (réversible) · orange → avertissement · vert → rétablit.
 * Réutilise le gel/dégel existant (suspend/restoreContributorRole). Ne touche JAMAIS quelqu'un déjà
 * sous sanction MANUELLE (la gouvernance prime). Réversible : casier revenu vert → on restaure l'exact.
 * AUCUN argent déplacé (on gèle des droits ; le gel commission est déjà auto dans lib/network).
 */
import { getDb } from '@/lib/db';
import { getCasier } from '@/lib/casier';
import { getContributor } from '@/lib/network';
import { suspendContributorRole, restoreContributorRole } from '@/lib/contributor-rights';
import { activeSanction } from '@/lib/sanctions';
import { createNotif } from '@/lib/notifs';

export type CasierAction = 'freeze' | 'unfreeze' | 'warn' | 'none';
export interface CasierOutcome { user_id: string; name?: string; action: CasierAction; reason: string; health: string; score: number }

function ensure() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS casier_auto_freezes (
    user_id TEXT PRIMARY KEY, prev_status TEXT, prev_rank INTEGER, reason TEXT, created_at INTEGER NOT NULL
  );`);
  return db;
}
interface Freeze { user_id: string; prev_status: string | null; prev_rank: number | null; reason: string; created_at: number }
function getAutoFreeze(userId: string): Freeze | null {
  return (ensure().prepare('SELECT * FROM casier_auto_freezes WHERE user_id = ?').get(userId) as Freeze) || null;
}
export function listAutoFrozenIds(): string[] {
  return (ensure().prepare('SELECT user_id FROM casier_auto_freezes').all() as { user_id: string }[]).map((r) => r.user_id);
}

/**
 * Décide + (sauf dryRun) applique la conséquence du casier d'un contributeur.
 * dryRun=true → ne fait RIEN, renvoie seulement ce qui se passerait (pour le preview staff).
 */
export function applyCasierConsequence(userId: string, opts: { dryRun?: boolean } = {}): CasierOutcome {
  const dryRun = opts.dryRun ?? true; // par défaut : preview, on n'agit pas sans demande explicite
  const c = getContributor(userId);
  const casier = getCasier(userId);
  const base = { user_id: userId, health: casier.health, score: casier.score };
  if (!c) return { ...base, action: 'none', reason: 'pas contributeur' };

  // Sanction MANUELLE active → la gouvernance a déjà tranché, on ne double pas.
  const manual = (() => { try { return activeSanction(userId); } catch { return null; } })();
  if (manual) return { ...base, action: 'none', reason: 'sanction manuelle active' };

  const frozen = getAutoFreeze(userId);
  const reasonRed = `auto:casier rouge (score ${casier.score} — ${casier.reports} plaintes, ${casier.refunds} remboursements, ${casier.churn} évictions, ${casier.litiges} litiges)`;

  // ROUGE + pas encore gelé auto → GEL + descente d'un échelon.
  if (casier.health === 'red' && !frozen) {
    if (!dryRun) {
      const prev = suspendContributorRole(userId, 'system');
      ensure().prepare('INSERT OR REPLACE INTO casier_auto_freezes (user_id, prev_status, prev_rank, reason, created_at) VALUES (?,?,?,?,?)')
        .run(userId, prev.prevStatus, prev.prevRank, reasonRed, Date.now());
      createNotif(userId, 'gouvernance', '⚠️ Rôle gelé (tes résultats)', `Ton casier est passé au rouge (${casier.score} pts). Ton rôle est gelé et tu redescends d'un échelon. Ça se rétablit dès que ton casier repasse au vert.`, '/parcours');
    }
    return { ...base, action: 'freeze', reason: reasonRed };
  }
  // VERT + gelé auto → on RESTAURE (l'échelle remonte quand les résultats reviennent).
  if (casier.health === 'green' && frozen) {
    if (!dryRun) {
      restoreContributorRole(userId, frozen.prev_status, frozen.prev_rank, 'system');
      ensure().prepare('DELETE FROM casier_auto_freezes WHERE user_id = ?').run(userId);
      createNotif(userId, 'gouvernance', '✅ Rôle rétabli', 'Ton casier est repassé au vert — ton rôle et ton échelon sont rétablis.', '/parcours');
    }
    return { ...base, action: 'unfreeze', reason: 'casier revenu vert' };
  }
  // ORANGE + pas gelé → simple avertissement (pas de gel).
  if (casier.health === 'orange' && !frozen) {
    if (!dryRun) createNotif(userId, 'gouvernance', '🟠 Attention à ton casier', `Ton casier est orange (${casier.score} pts). Redresse tes résultats (litiges/remboursements) avant le gel automatique.`, '/parcours');
    return { ...base, action: 'warn', reason: `casier orange (score ${casier.score})` };
  }
  return { ...base, action: 'none', reason: `casier ${casier.health}` };
}
