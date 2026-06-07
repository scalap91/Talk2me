import type { Extractor } from '../types';

/**
 * Facebook extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues (cf. parseFacebook dans /lib/url-parser.ts) :
 *  - facebook.com/share[/v|/p|/r]/<token>   (shortcode app native, opaque)
 *  - facebook.com/<user>/posts/<id>
 *  - facebook.com/<user>/videos/<id>
 *  - facebook.com/<user>/photos/<id>
 *  - facebook.com/photo.php?fbid=<id>
 *  - facebook.com/watch?v=<id>
 *  - facebook.com/reel/<id>
 *  - fb.watch/<token>
 *
 * Pour les shortcodes share/* et fb.watch/*, on utilise `/api/facebook-resolve`
 * (déjà existant) qui suit les redirects et retourne l'URL canonique + type.
 *
 * Embed officiel : `facebook.com/plugins/(post|video).php?href=<longUrl>`.
 *
 * Aspect-ratio selon type :
 *  - reel  → 9/16
 *  - video → 16/9
 *  - autre → 1/1 (le plugin gère sa hauteur via show_text)
 */

const FACEBOOK_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com\/|fb\.watch\/)/i;
const SHARE_RE = /\/share\/|fb\.watch\//i;

type FbType = 'post' | 'video' | 'reel' | 'photo';

function detectType(url: string): FbType {
  if (/\/share\/v\//i.test(url) || /\/videos?\//i.test(url) || /\/watch\/?\?v=/i.test(url)) return 'video';
  if (/\/share\/r\//i.test(url) || /\/reel\//i.test(url)) return 'reel';
  if (/\/photos?\//i.test(url) || /photo\.php/i.test(url)) return 'photo';
  return 'post';
}

export const facebookExtractor: Extractor = async (url, ctx) => {
  if (!FACEBOOK_REGEX.test(url)) return { ok: false, reason: 'not_facebook' };

  let canonicalUrl = url;
  let type: FbType = detectType(url);

  if (SHARE_RE.test(url)) {
    // Resolve via le sub-endpoint Talk2Me.
    try {
      const res = await fetch(
        `${ctx.baseUrl}/api/facebook-resolve?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
      );
      if (res.ok) {
        const j = (await res.json()) as {
          ok?: boolean;
          data?: { original_url?: string; type?: FbType };
        };
        if (j?.ok && j?.data?.original_url) {
          canonicalUrl = j.data.original_url;
          if (j.data.type) type = j.data.type;
        }
      }
    } catch {
      /* silent */
    }
  }

  // Bug #3 audit #413 (Pascal 2026-06-05) : option B "link-out only".
  // L'iframe `facebook.com/plugins/...` exige une whitelist App Domains
  // côté FB Business + SDK FB JS chargé sur la page parente. Sans setup
  // FB Developer console, le plugin affiche un cadre vide.
  //
  // → On NE produit PLUS d'embed iframe. À la place : card riche via
  // OpenGraph (titre + thumb + description) + bouton "Ouvrir sur
  // Facebook". L'user voit un aperçu visuel et clique pour ouvrir l'app.
  let ogTitle =
    type === 'reel'
      ? 'Reel Facebook'
      : type === 'video'
        ? 'Vidéo Facebook'
        : 'Post Facebook';
  let ogDescription: string | undefined;
  let ogImage: string | undefined;
  try {
    const ogRes = await fetch(
      `${ctx.baseUrl}/api/og?url=${encodeURIComponent(canonicalUrl)}`,
      { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
    );
    if (ogRes.ok) {
      const j = (await ogRes.json()) as {
        ok?: boolean;
        data?: { title?: string; description?: string; image?: string };
      };
      if (j?.ok && j?.data) {
        ogTitle = j.data.title || ogTitle;
        ogDescription = j.data.description;
        ogImage = j.data.image;
      }
    }
  } catch {
    /* silent */
  }

  return {
    ok: true,
    card: {
      source: 'facebook',
      source_label: 'Facebook',
      type:
        type === 'photo'
          ? 'image'
          : type === 'video' || type === 'reel'
            ? 'video'
            : 'social_post',
      title: ogTitle,
      description: ogDescription,
      thumbnail_url: ogImage,
      external_url: canonicalUrl,
      // PAS d'embed : l'iframe FB plugin ne marche pas en pratique sans
      // setup FB Developer. FallbackCard prend le relais (thumb + lien).
      meta: {
        fb_type: type,
        original_url: url,
        canonical_url: canonicalUrl,
        link_out_only: true,
      },
      actions: [
        { kind: 'open', label: 'Voir sur Facebook', url: canonicalUrl },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
