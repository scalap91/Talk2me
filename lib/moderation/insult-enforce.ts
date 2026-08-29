/**
 * Talk2Me — INSULT-ENFORCE (Pascal 2026-08-29, Branchement 1). L'app TRANCHE : quand un propos
 * GRAVE est détecté (insult-guard), on :
 *   1. SIGNALE l'auteur (reportUser système, motif 'haine') → nourrit le CASIER existant (getCasier).
 *   2. 1er grave (aucune sanction active) → applique L1 « Avertissement » AUTO (safe, non-argent,
 *      déjà câblé) + notifie l'auteur. Les récidives accumulent les signalements → casier orange/red
 *      → suggère L2+ (gaté, GO Pascal), TOUJOURS via le ban à 2 vitesses (deals en cours d'abord).
 *
 * Réutilisé par les points d'écriture (commentaires, messages). Fire-and-forget best-effort.
 */
import { reportUser } from '@/lib/moderation';
import { applySanction, activeSanction, enforceSanction } from '@/lib/sanctions';

const SYSTEM = 'system'; // auteur du signalement automatique (pas un vrai user)

/** À appeler quand un propos GRAVE est détecté chez `authorId`. */
export function enforceGraveInsult(authorId: string, sample: string): void {
  if (!authorId) return;
  try {
    reportUser(SYSTEM, authorId, 'haine', `Propos injurieux détecté automatiquement : « ${sample.slice(0, 120)} »`);
  } catch { /* best-effort */ }
  try {
    // 1er grave uniquement → L1 Avertissement (éducatif). Ensuite, ce sont les signalements
    // accumulés qui font monter le casier ; l'ouverture de L2+ reste gatée (feu vert Pascal).
    if (!activeSanction(authorId)) {
      const reason = 'Propos injurieux détectés automatiquement. Reste courtois — récidive = sanction plus lourde.';
      const res = applySanction(authorId, 1, reason, SYSTEM);
      if (res.ok) void enforceSanction(authorId, 1, reason);
    }
  } catch { /* best-effort */ }
}
