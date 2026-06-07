import type { Extractor } from '../types';

/**
 * Article extractor — Universal Embed Hub Phase 1.
 *
 * Fallback générique pour tout site web non reconnu par les extracteurs
 * spécifiques. Utilise `/api/og` pour récupérer Open Graph + Twitter Cards.
 * Si OG échoue, on remonte une raison pour que `buildUnifiedCard` produise
 * une fallback card minimale.
 */

export const articleExtractor: Extractor = async (url, ctx) => {
  try {
    const res = await fetch(
      `${ctx.baseUrl}/api/og?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
    );
    if (!res.ok) return { ok: false, reason: 'og_failed' };
    const j = (await res.json()) as {
      ok?: boolean;
      data?: {
        title?: string;
        description?: string;
        image?: string;
        siteName?: string;
      };
    };
    if (!j?.ok || !j?.data) return { ok: false, reason: 'og_empty' };
    const d = j.data;

    const hostname = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return '';
      }
    })();

    return {
      ok: true,
      card: {
        source: 'web',
        source_label: d.siteName || hostname,
        type: 'article',
        title: d.title || hostname,
        description: d.description,
        thumbnail_url: d.image,
        external_url: url,
        actions: [
          { kind: 'open', label: "Lire l'article", url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  } catch {
    return { ok: false, reason: 'fetch_error' };
  }
};
