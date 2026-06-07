/**
 * N2 — Écosystème Talk2Me (Pascal 2026-06-04, refactor Lot 1bis).
 *
 * Source de vérité = consciousness.json (platform.products). Ajouter un produit
 * = éditer ce JSON, pas ce fichier.
 *
 * Doctrine maître :
 *   Chat / Home / Mes Cards / Profils / Amis / Recherche / Watch Together /
 *   Audio Vidéo / Groupes / Éditeur IA de Card.
 */

import type { ConsciousnessContext } from './types';
import consciousness from './consciousness.json';

/** Libellés affichables pour chaque clé produit. */
const PRODUCT_LABELS: Record<string, string> = {
  chat: "Chat : conversations avec l'utilisateur ou avec ses amis (l'IA peut être taggée @<aiName>)",
  home: 'Home : feed de cards publiques scrollable',
  cards: 'Mes Cards : bibliothèque personnelle (Brouillons + Publiées)',
  profiles: 'Profils : page utilisateur (cards publiées, amis, contact card)',
  search: 'Recherche : exploration de cards et users',
  watch_together:
    'Watch Together : visionnage synchrone vidéo entre amis dans une conv',
  audio_video_calls: 'Audio/Vidéo : appels WebRTC P2P',
  groups: 'Groupes : conversations multi-users (à venir)',
  ai_editor:
    "Éditeur IA de Card : création/modification assistée par mon mode éditeur",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function buildEcosystem(
  _ctx: ConsciousnessContext,
): Promise<string> {
  const platformName = consciousness.platform?.name || 'Talk2Me';
  const products: string[] = consciousness.platform?.products || [];

  const lines: string[] = [
    `## ÉCOSYSTÈME ${platformName.toUpperCase()}`,
    '',
    `Produits disponibles dans ${platformName} :`,
  ];
  for (const key of products) {
    const label = PRODUCT_LABELS[key] || `${key} : (produit non documenté)`;
    lines.push(`- ${label}`);
  }
  lines.push('');
  lines.push(
    "Je peux interagir avec : Chat (par défaut), Cards (création/édition), Recherche.",
  );
  return lines.join('\n');
}
