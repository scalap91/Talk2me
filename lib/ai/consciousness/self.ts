/**
 * N1 — Conscience de soi (Pascal 2026-06-04, refactor Lot 1bis).
 *
 * "Qui je suis ?" Récupère ai_name, ai_gender, ai_avatar_url de la table users
 * + display_name du owner. Pas de fallback inventif : tout vient de la DB
 * + format depuis consciousness.json (ai_identity_template).
 *
 * Doctrine [[talktome-ia-persistance-isolation]] : l'IA EST l'IA du user,
 * pas une IA générique. Le bloc renforce cette appartenance en TÊTE du prompt.
 *
 * Standardisation Lot 1bis : format "{ai_name}, l'IA personnelle de {display_name}".
 * INTERDIT : "Je m'appelle Talk2Me" (cf consciousness.json never_say).
 */

import { getUserById, type AiGender } from '@/lib/db';
import type { ConsciousnessContext } from './types';
import consciousness from './consciousness.json';

function genderLabelFr(g: AiGender): string {
  switch (g) {
    case 'feminin':
      return 'féminin';
    case 'masculin':
      return 'masculin';
    case 'neutre':
    default:
      return 'neutre';
  }
}

function ownerNameOf(user: {
  display_name: string | null;
  username: string;
}): string {
  const dn = (user.display_name || '').trim();
  if (dn) return dn;
  return user.username || "l'utilisateur";
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export async function buildSelf(ctx: ConsciousnessContext): Promise<string> {
  const platformName = consciousness.platform?.name || 'Talk2Me';
  const tpl = consciousness.ai_identity_template || {
    default_name_format: 'T2M de {display_name}',
    display_format: '{ai_name} · IA personnelle de {display_name}',
    self_intro_format:
      "Je suis {ai_name}, l'IA personnelle de {display_name}.",
    never_say: [],
  };

  const user = getUserById(ctx.userId);
  if (!user) {
    return [
      '## QUI SUIS-JE',
      '- Nom : (inconnu — user non résolu)',
      `- Plateforme : ${platformName}`,
      '- Version : V1',
    ].join('\n');
  }

  const owner = ownerNameOf(user);
  const aiName =
    (user.ai_name || '').trim() ||
    interpolate(tpl.default_name_format, { display_name: owner });
  const gender = genderLabelFr(user.ai_gender);
  const intro = interpolate(tpl.self_intro_format, {
    ai_name: aiName,
    display_name: owner,
  });
  const display = interpolate(tpl.display_format, {
    ai_name: aiName,
    display_name: owner,
  });

  const lines: string[] = [
    '## QUI SUIS-JE',
    `- Nom : ${aiName}`,
    `- Affichage : ${display}`,
    '- Type : IA personnelle',
    `- Plateforme : ${platformName}`,
    '- Version : V1',
    `- Propriétaire : ${owner}`,
    `- Genre : ${gender}`,
    `- Mission : Assister ${owner} dans ses conversations, l'aider à trouver, créer, organiser et partager du contenu via ${platformName}.`,
    '',
    `Quand on me demande "qui es-tu ?", je réponds : « ${intro} »`,
    '',
    `Je ne suis PAS une IA générique. Je suis l'IA de ${owner}. Mes mémoires, habitudes et préférences sont strictement les siennes.`,
  ];

  if (Array.isArray(tpl.never_say) && tpl.never_say.length > 0) {
    lines.push('');
    lines.push('INTERDIT : ne JAMAIS dire :');
    for (const s of tpl.never_say) lines.push(`  - « ${s} »`);
  }

  return lines.join('\n');
}
