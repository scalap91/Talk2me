import type { Extractor } from '../types';

/**
 * Image extractor — Universal Embed Hub Phase 4 (Pascal 2026-06-05).
 *
 * Bug #5 audit #413 : un user qui partage un lien vers une image directe
 * (images.unsplash.com/photo-xxx.jpg, i.imgur.com/abc.png, etc.) ne voyait
 * QUE le lien brut "Ouvrir ↗" sans aperçu (article extractor renvoyait
 * `og_empty`). Cet extractor :
 *  1) match les URLs avec extension image connue
 *  2) HEAD vérifie content-type `image/*` (sécurité)
 *  3) retourne une UnifiedCard type=image avec embed.kind='image' +
 *     image_url qui sera rendue directement par UnifiedCardRenderer.
 *
 * Pas d'oEmbed, pas d'OG : l'URL EST l'image.
 */

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?.*)?(#.*)?$/i;
// Hosts CDN images directs (utiles quand l'URL n'a pas d'extension propre).
const IMAGE_HOST_REGEX =
  /^(images\.unsplash\.com|i\.imgur\.com|cdn\.discordapp\.com|media\.giphy\.com|media[0-9]?\.tenor\.com)/i;

function matchesImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (IMAGE_EXT_REGEX.test(u.pathname)) return true;
    if (IMAGE_HOST_REGEX.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

async function verifyContentType(
  url: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return /^image\//i.test(ct);
  } catch {
    return false;
  }
}

export const imageExtractor: Extractor = async (url, ctx) => {
  if (!matchesImageUrl(url)) return { ok: false, reason: 'not_image_url' };

  // HEAD pour valider que c'est vraiment une image (un lien
  // images.unsplash.com peut redirect vers une page HTML pour certaines
  // IDs invalides). Timeout court : si HEAD trop lent, on accorde le
  // bénéfice du doute (matchesImageUrl déjà filtré).
  const isImage = await verifyContentType(
    url,
    Math.min(ctx.resolverTimeoutMs || 5000, 2500)
  );
  if (!isImage) {
    // Pas vérifié → on tente quand même un render image car l'URL match
    // un pattern connu ; si l'image elle-même casse, FallbackCard via
    // onError. Pas de réseau garanti sur HEAD CDN.
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* keep empty */
  }
  const filename = (() => {
    try {
      const p = new URL(url).pathname;
      return p.split('/').filter(Boolean).pop() || hostname;
    } catch {
      return hostname;
    }
  })();

  return {
    ok: true,
    card: {
      source: 'image',
      source_label: hostname || 'Image',
      type: 'image',
      title: filename || 'Image',
      thumbnail_url: url,
      external_url: url,
      embed: {
        kind: 'image',
        image_url: url,
        alt: filename || 'image partagée',
      },
      meta: { image_host: hostname, verified_content_type: isImage },
      actions: [
        { kind: 'open', label: 'Ouvrir', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
