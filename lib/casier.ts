import 'server-only';
/**
 * Talk2Me — LE CASIER DE RÉSULTATS (Pascal 2026-07-27, doctrine gouvernance anti-corruption).
 *
 * Le dossier de RÉSULTATS d'une personne du réseau, fait de FAITS mesurés (pas d'opinions) :
 * churn de référent · plaintes · remboursements escrow · litiges. C'est la DATA qui attrape la
 * corruption : mauvais casier → (plus tard) gel/rétrogradation AUTO. Le mérite fait monter, les
 * résultats font tomber. [[project_talk2me_gouvernance_anticorruption]]
 *
 * Étape #2 (NON-ARGENT) : on LIT et on AGRÈGE des signaux qui EXISTENT déjà. On ne déplace pas d'euros,
 * on ne sanctionne pas encore (les seuils gel/rétro = étape #3). Agrégation DÉFENSIVE : chaque signal en
 * try/catch → 0 si la table manque → jamais de crash.
 */
import { getDb } from '@/lib/db';
import { churnCountFor } from '@/lib/referents';
import { activeSanction } from '@/lib/sanctions';

export interface Casier {
  churn: number;    // commerces qui l'ont VIRÉ comme référent (referent_events)
  reports: number;  // plaintes déposées contre lui (user_reports)
  refunds: number;  // remboursements escrow où il était bénéficiaire/vendeur
  litiges: number;  // conversations commerce (litige vendeur↔acheteur) où il est
  score: number;    // somme pondérée (indicateur, pas une sanction)
  health: 'green' | 'orange' | 'red';
  suggested: number;                  // niveau de sanction SUGGÉRÉ par la data (0=aucun) — la « data alerte », pas une décision
  sanction: { level: number; reason: string } | null; // sanction ACTIVE en cours (si posée par la gouvernance)
}

function count(sql: string, ...params: unknown[]): number {
  try {
    const r = getDb().prepare(sql).get(...params) as { c: number } | undefined;
    return r ? r.c : 0;
  } catch {
    return 0; // table absente / migration pas passée → signal neutre
  }
}

/** Le casier d'une personne, agrégé depuis les signaux réels. sinceMs=0 → tout l'historique. */
export function getCasier(userId: string, sinceMs = 0): Casier {
  if (!userId) return { churn: 0, reports: 0, refunds: 0, litiges: 0, score: 0, health: 'green', suggested: 0, sanction: null };
  const churn = (() => { try { return churnCountFor(userId, sinceMs); } catch { return 0; } })();
  const reports = count('SELECT COUNT(*) c FROM user_reports WHERE reported_user_id = ? AND created_at >= ?', userId, sinceMs);
  // Le vendeur est dans breakdown_json ({user_id, role}). LIKE sur l'id = « il est bénéficiaire de cet escrow remboursé ».
  const refunds = count("SELECT COUNT(*) c FROM escrows WHERE status = 'refunded' AND created_at >= ? AND breakdown_json LIKE ?", sinceMs, `%"user_id":"${userId}"%`);
  const litiges = count("SELECT COUNT(DISTINCT c.id) c FROM conversations c JOIN conversation_participants p ON p.conversation_id = c.id WHERE c.kind = 'commerce' AND p.user_id = ?", userId);
  // Pondération : la plainte pèse le plus, puis churn/refund, puis litige (un litige ouvert ≠ une faute).
  const score = churn * 2 + reports * 3 + refunds * 2 + litiges * 1;
  const health: Casier['health'] = score >= 10 ? 'red' : score >= 4 ? 'orange' : 'green';
  // La DATA suggère un niveau (elle ALERTE, elle ne sanctionne pas) : orange → L1 (avertissement), rouge → L2 (restriction).
  const suggested = score >= 10 ? 2 : score >= 4 ? 1 : 0;
  const act = (() => { try { const s = activeSanction(userId); return s ? { level: s.level, reason: s.reason } : null; } catch { return null; } })();
  return { churn, reports, refunds, litiges, score, health, suggested, sanction: act };
}
