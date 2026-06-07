/**
 * N8 — Conscience du contexte / mode actif (Pascal 2026-06-04, Lot 2).
 *
 * Doctrine maître Pascal :
 *   NIVEAU 8 : "Dans quel module suis-je ? Chat / Cards / Watch Together /
 *               Éditeur vidéo / Éditeur image / Recherche. Chaque contexte
 *               active des compétences différentes."
 *   NIVEAU 9 : "Mode Éditeur vidéo : découpe ✓ texte ✓ transition ✓ musique ✓
 *               recherche hôtel ✗ recherche restaurant ✗. Les autres
 *               capacités sont temporairement gelées."
 *
 * Ce bloc est injecté dans le system prompt EN PLUS du gate technique
 * (mode-gate.ts qui retire physiquement les tools gelés de la liste DeepSeek).
 *
 * Le gate empêche d'appeler les tools gelés ; ce bloc fait que DeepSeek SAIT
 * qu'il est dans un mode restreint et répond gracieusement aux demandes
 * hors-périmètre au lieu de feindre l'ignorance ou bricoler.
 *
 * Source de vérité : consciousness.json section `modes[mode]` avec
 *   { label, description, skills_active_fr, skills_frozen_fr }.
 */

import type { ConsciousnessContext, ConsciousnessMode } from './types';
import {
  getModeLabel,
  getModeDescription,
  getSkillsActiveFr,
  getSkillsFrozenFr,
} from '../mode-gate';

function bullet(items: string[], glyph: string): string {
  return items.map((s) => `${glyph} ${s}`).join('\n');
}

export function buildContextMode(ctx: ConsciousnessContext): string {
  const mode: ConsciousnessMode = ctx.mode || 'chat';
  const label = getModeLabel(mode);
  const description = getModeDescription(mode);
  const active = getSkillsActiveFr(mode);
  const frozen = getSkillsFrozenFr(mode);

  const lines: string[] = [];
  lines.push(`## MODE ACTUEL : ${label}`);
  if (description) {
    lines.push('');
    lines.push(description);
  }
  lines.push('');
  lines.push(`Je suis actuellement en mode "${label}".`);

  if (active.length > 0) {
    lines.push('');
    lines.push('Mes compétences ACTIVES :');
    lines.push(bullet(active, '  ✓'));
  }

  if (frozen.length > 0) {
    lines.push('');
    lines.push('Mes compétences GELÉES temporairement :');
    lines.push(bullet(frozen, '  ✗'));
  }

  // Règle de réponse hors-périmètre — ne s'applique que si on a des gels
  if (frozen.length > 0) {
    lines.push('');
    lines.push('RÈGLE HORS-PÉRIMÈTRE :');
    lines.push(
      `Si l'utilisateur me demande quelque chose qui sort du périmètre "${label}" :`,
    );
    lines.push('  - Je n\'essaie PAS d\'appeler un tool gelé (ils ne sont de toute façon plus disponibles dans ma liste).');
    lines.push(
      `  - Je réponds poliment en 1 phrase, sans excuse longue : « Je suis en mode ${label}, je ne peux pas faire ça ici. Reviens au chat normal pour cela. »`,
    );
    lines.push('  - Je propose ensuite de continuer ce qu\'on faisait dans le mode courant.');
    lines.push('  - Je n\'invente JAMAIS de réponse de remplacement (pas de pseudo-recherche, pas de pseudo-résultat).');
  }

  return lines.join('\n');
}
