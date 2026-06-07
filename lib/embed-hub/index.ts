import type { UnifiedCard, ExtractorContext } from './types';
import { detectExtractor } from './registry';
import { buildFallbackCard } from './fallback';

/**
 * Universal Embed Hub — entrée principale.
 *
 * Pipeline unique : URL → detectExtractor → extractor(url) → UnifiedCard.
 * En cas d'échec (extractor manquant, reason renvoyée, exception), produit
 * toujours une fallback card (doctrine `feedback_talktome_no_excuses`).
 */

export async function buildUnifiedCard(
  url: string,
  ctx?: Partial<ExtractorContext>
): Promise<UnifiedCard> {
  const fullCtx: ExtractorContext = {
    baseUrl: ctx?.baseUrl || 'http://localhost:3010',
    resolverTimeoutMs: ctx?.resolverTimeoutMs ?? 5000,
    publicHostname: ctx?.publicHostname,
  };

  const extractor = detectExtractor(url);
  if (!extractor) return buildFallbackCard(url, 'no_extractor');

  try {
    const result = await extractor(url, fullCtx);
    if (result.ok && result.card) return result.card;
    return buildFallbackCard(url, result.reason || 'unknown');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'extractor_throw';
    return buildFallbackCard(url, msg);
  }
}

export type { UnifiedCard, ExtractorContext } from './types';
