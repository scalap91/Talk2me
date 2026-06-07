import type { UnifiedCard } from './types';

/**
 * Universal Embed Hub — validateur structurel de UnifiedCard.
 *
 * Garantit qu'une card minimalement utilisable arrive au renderer :
 * - champs requis (source, title, external_url)
 * - iframe avec src
 * - au moins une action, dont une "open" vers external_url
 */

export function validateUnifiedCard(
  card: UnifiedCard
): { ok: boolean; reason?: string } {
  if (!card.source || !card.title || !card.external_url) {
    return { ok: false, reason: 'missing_required_fields' };
  }
  if (card.embed?.kind === 'iframe' && !card.embed.src) {
    return { ok: false, reason: 'iframe_missing_src' };
  }
  // `kind: 'custom'` autorise l'absence de src (ex: Twitter srcDoc oEmbed).
  // Le renderer doit savoir interpréter `meta.oembed_srcdoc` ou `meta.oembed_html`.
  if (!card.actions || card.actions.length === 0) {
    return { ok: false, reason: 'no_actions' };
  }
  // S'assurer qu'il y a au moins une action "open" vers external_url
  const hasOpen = card.actions.some((a) => a.kind === 'open');
  if (!hasOpen) return { ok: false, reason: 'no_open_action' };
  return { ok: true };
}
