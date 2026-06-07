import type { Extractor } from '../types';

/**
 * Pinterest extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : pinterest.<tld>/pin/<id>.
 *
 * Pinterest n'offre pas d'iframe par ID. La méthode officielle utilise leur
 * script `assets.pinterest.com/js/pinit.js` qui transforme un `<a data-pin-do>`
 * en pin embed. Notre Hub étant côté serveur/iframe-only, on tente oEmbed
 * Pinterest pour récupérer une miniature + titre exploitables :
 *   `https://www.pinterest.com/oembed.json?url=<URL>` → { title, thumbnail_url, ... }
 *
 * Pas d'embed `kind:iframe` natif (UnifiedCardRenderer → FallbackCard avec
 * thumbnail). Le composant Pinterest historique (PinterestEmbed.tsx) reste
 * disponible pour le double système.
 */

const PINTEREST_REGEX =
  /^(?:https?:\/\/)?(?:[a-z]{2}\.|www\.)?pinterest\.[a-z.]+\/pin\/([0-9]+)/i;

export const pinterestExtractor: Extractor = async (url, ctx) => {
  const m = url.match(PINTEREST_REGEX);
  if (!m) return { ok: false, reason: 'not_pinterest' };
  const pinId = m[1];

  let title = `Pinterest · pin ${pinId}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  let description: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000),
        headers: { 'User-Agent': 'Mozilla/5.0 Talk2MeBot/1.0' },
      }
    );
    if (oembedRes.ok) {
      const j = (await oembedRes.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
        description?: string;
      };
      title = j.title || title;
      authorName = j.author_name;
      thumbnail = j.thumbnail_url;
      description = j.description;
    }
  } catch {
    /* silent */
  }

  return {
    ok: true,
    card: {
      source: 'pinterest',
      source_label: 'Pinterest',
      type: 'image',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      description,
      external_url: url,
      // Pas d'iframe officielle simple → on laisse FallbackCard render la
      // thumbnail + lien "Ouvrir". Le composant <PinterestEmbed> historique
      // (script pinit.js) reste utilisé via EmbedRenderer pour les conv.
      meta: { pin_id: pinId },
      actions: [
        { kind: 'open', label: 'Voir sur Pinterest', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
