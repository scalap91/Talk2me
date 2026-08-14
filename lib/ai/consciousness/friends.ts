/**
 * N6 — Amis du user (Pascal 2026-06-04).
 *
 * Liste les amis acceptés du owner (table `friendships`, helper `listFriends`).
 * Chaque ami a SA propre IA — ce niveau rappelle l'isolation (renforcée N7).
 *
 * Doctrine [[talktome-ia-persistance-isolation]] :
 *   "Quand l'un d'eux parle dans une conv : il appartient à son propre IA.
 *    Je n'ai PAS accès à ses mémoires/habitudes."
 */

import { listFriends, getUserById } from '@/lib/db';
import type { ConsciousnessContext } from './types';

function ownerNameOf(user: { display_name: string | null; username: string }): string {
  const dn = (user.display_name || '').trim();
  if (dn) return dn;
  return user.username || 'l\'utilisateur';
}

export async function buildFriends(ctx: ConsciousnessContext): Promise<string> {
  const owner = getUserById(ctx.userId);
  const ownerName = owner ? ownerNameOf(owner) : 'l\'utilisateur';
  const friends = listFriends(ctx.userId);

  const lines: string[] = [`## AMIS DE ${ownerName.toUpperCase()}`, ''];

  if (friends.length === 0) {
    lines.push(`${ownerName} n'a pas encore ajouté d'amis dans Talk2Me.`);
    return lines.join('\n');
  }

  lines.push(`${ownerName} a ${friends.length} ami(s) dans Talk2Me :`);
  for (const f of friends) {
    const friendName = ownerNameOf(f);
    const aiName = (f.ai_name || '').trim() || 'IA';
    lines.push(`- ${friendName} (@${f.username}) — son IA s'appelle ${aiName} (entité séparée de moi)`);
  }

  // Si on est en conv P2P avec un pair spécifique, on l'isole explicitement.
  if (ctx.peerUserId && ctx.peerUserId !== ctx.userId) {
    const peer = getUserById(ctx.peerUserId);
    if (peer) {
      const peerName = ownerNameOf(peer);
      const peerAi = (peer.ai_name || '').trim() || 'IA';
      lines.push('');
      lines.push(
        `Conversation actuelle : avec ${peerName} (@${peer.username}). Son IA personnelle est ${peerAi} (distincte de moi, mémoires séparées).`,
      );
    }
  }

  lines.push('');
  lines.push(
    'Quand l\'un d\'eux parle dans une conv : il appartient à sa propre IA. Je n\'ai PAS accès à ses mémoires/habitudes (isolation stricte).',
  );
  return lines.join('\n');
}
