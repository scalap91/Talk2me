import type { Extractor } from '../types';

/**
 * Instagram extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : instagram.com/(p|reel|reels|tv)/<shortcode>.
 *
 * Embed officiel non-authentifié : `/<type>/<shortcode>/embed/captioned/`
 * qui injecte la card avec sa légende.
 *
 * Type carte :
 *  - p (post)  → image       (aspect 1/1)
 *  - reel / tv → video       (aspect 9/16)
 */

const INSTAGRAM_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i;

export const instagramExtractor: Extractor = async (url) => {
  const m = url.match(INSTAGRAM_REGEX);
  if (!m) return { ok: false, reason: 'not_instagram' };
  const rawType = m[1].toLowerCase();
  const shortcode = m[2];
  const isReel = rawType === 'reel' || rawType === 'reels' || rawType === 'tv';
  const pathType = isReel ? 'reel' : 'p';
  const embedUrl = `https://www.instagram.com/${pathType}/${shortcode}/embed/captioned/`;

  return {
    ok: true,
    card: {
      source: 'instagram',
      source_label: 'Instagram',
      type: isReel ? 'video' : 'image',
      title: isReel ? `Reel Instagram` : `Post Instagram`,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: embedUrl,
        aspect_ratio: isReel ? '9 / 16' : '1 / 1',
        allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
        allow_fullscreen: true,
      },
      meta: { ig_type: isReel ? 'reel' : 'post', shortcode },
      actions: [
        { kind: 'open', label: 'Voir sur Instagram', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
