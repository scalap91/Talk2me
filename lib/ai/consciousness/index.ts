/**
 * Talk2Me #339 — AI Consciousness Core, assembleur (Pascal 2026-06-04).
 *
 * Construit le bloc markdown injecté EN TÊTE du system prompt avant chaque
 * appel DeepSeek (chat solo, P2P, futurs modes).
 *
 * Lot 1 : niveaux 1 → 7 (self / ecosystem / tools / cards / user / friends /
 * other-ais).
 * Lot 2 (Pascal 2026-06-04) : N8 context-mode + N9 skills-by-mode (gérés
 * conjointement par buildContextMode lisant consciousness.json modes.*).
 * Lots suivants : N10 limits, N11 reasoning-checklist, N12 visual-qa.
 *
 * Cache 60s par (userId, mode). Cf cache.ts.
 *
 * Doctrine [[talk2me-ai-consciousness-core]] :
 *   "Module central obligatoire chargé AVANT toute réponse. Cerveau permanent
 *    de chaque IA."
 */

import { buildSelf } from './self';
import { buildEcosystem } from './ecosystem';
import { buildToolsCatalog } from './tools-catalog';
import { buildCardsCatalog } from './cards-catalog';
import { buildUserSnapshot } from './user-snapshot';
import { buildFriends } from './friends';
import { buildOtherAis } from './other-ais';
import { buildContextMode } from './context-mode';
import { getCached, setCached, invalidateUser } from './cache';
import type { ConsciousnessContext, ConsciousnessMode } from './types';

export type { ConsciousnessContext, ConsciousnessMode } from './types';
export { invalidateUser as invalidateConsciousness };

const HEADER = '=== AI CONSCIOUSNESS CORE (charger AVANT toute action — Pascal 2026-06-04) ===';
const FOOTER = '=== FIN CONSCIOUSNESS ===';

export async function buildConsciousness(
  ctx: ConsciousnessContext,
): Promise<string> {
  const mode: ConsciousnessMode = ctx.mode || 'chat';
  if (!ctx.userId) {
    return [HEADER, '(user non identifié)', FOOTER].join('\n');
  }

  // Cache 60s — basé sur (userId, mode). Pour les modes futurs, on garde
  // une clé séparée pour éviter le mix.
  const cached = getCached(ctx.userId, mode);
  if (cached) return cached;

  // Build parallèle des 7 niveaux — aucune dépendance entre eux.
  const [self, ecosystem, tools, cards, user, friends, otherAis] = await Promise.all([
    buildSelf(ctx),
    buildEcosystem(ctx),
    buildToolsCatalog(ctx),
    buildCardsCatalog(ctx),
    buildUserSnapshot(ctx),
    buildFriends(ctx),
    buildOtherAis(ctx),
  ]);

  // N8/N9 — Lot 2 : bloc mode actuel (compétences actives / gelées + règle
  // hors-périmètre). Synchrone car ne fait que lire consciousness.json.
  const contextMode = buildContextMode(ctx);

  const block = [
    HEADER,
    '',
    self,
    '',
    ecosystem,
    '',
    tools,
    '',
    cards,
    '',
    user,
    '',
    friends,
    '',
    otherAis,
    '',
    contextMode,
    '',
    FOOTER,
  ].join('\n');

  setCached(ctx.userId, mode, block);
  return block;
}
