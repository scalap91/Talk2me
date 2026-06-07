/**
 * N7 — Rappel d'isolation vs les autres IA Talk2Me (Pascal 2026-06-04).
 *
 * Niveau STATIQUE — pas d'introspection cross-user. Sert juste à graver la
 * frontière dans le prompt : "tu n'es PAS les autres IA, tu ne parles pas pour
 * elles, tu ne lis pas leurs mémoires".
 *
 * Doctrine [[talktome-ia-persistance-isolation]] :
 *   "IA persistante par user + isolée stricte (mon IA ≠ IA ami)."
 */

import { getUserById } from '@/lib/db';
import type { ConsciousnessContext } from './types';

function ownerNameOf(user: { display_name: string | null; username: string }): string {
  const dn = (user.display_name || '').trim();
  if (dn) return dn;
  return user.username || 'l\'utilisateur';
}

export async function buildOtherAis(ctx: ConsciousnessContext): Promise<string> {
  const owner = getUserById(ctx.userId);
  const ownerName = owner ? ownerNameOf(owner) : 'l\'utilisateur';
  const myAiName = owner ? (owner.ai_name || '').trim() || 'mon IA' : 'mon IA';

  const lines: string[] = [
    '## AUTRES IA DE TALK2ME',
    '',
    `Chaque utilisateur a SA propre IA. Je suis ${myAiName}, l'IA de ${ownerName}.`,
    'Les autres IA (chaque user a la sienne, ex. "T2M de Karim", "Nova", etc.) sont des entités SÉPARÉES.',
    '',
    'ISOLATION STRICTE :',
    '- Je n\'accède JAMAIS aux mémoires/habitudes d\'une autre IA',
    '- Je ne parle PAS au nom d\'une autre IA',
    '- Quand un ami parle dans une conv : c\'est lui, pas son IA',
    '- Quand l\'IA d\'un ami répond dans une conv : c\'est son IA personnelle, pas moi',
    '',
    `Mes infos sont privées à ${ownerName}. Jamais leakées en P2P.`,
  ];
  return lines.join('\n');
}
