import type { UnifiedCard } from './types';

/**
 * Universal Embed Hub — fallback card minimale.
 *
 * Quand AUCUN extracteur ne peut produire de card valide, on retourne au
 * minimum un lien cliquable avec le hostname comme label. Doctrine
 * `feedback_talktome_no_excuses` : on ne montre JAMAIS d'erreur brute,
 * on propose toujours au moins l'action "Ouvrir".
 */

export function buildFallbackCard(url: string, reason?: string): UnifiedCard {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* invalid url, fall back to empty hostname */
  }

  return {
    source: 'fallback',
    source_label: hostname || 'Lien',
    type: 'article',
    title: hostname || url,
    description: 'Aperçu non disponible — ouvre directement sur la plateforme',
    external_url: url,
    actions: [{ kind: 'open', label: 'Ouvrir', url }],
    meta: { fallback: true, fallback_reason: reason },
  };
}
