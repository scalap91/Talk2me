import type { Extractor } from '../types';

/**
 * Reddit extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : reddit.com/r/<sub>/comments/<id>/<slug>.
 *
 * Embed officiel : `embed.reddit.com/r/<sub>/comments/<id>/<slug>` (rend
 * une card statique : titre, score, top comment). Hauteur fixe 500 avec
 * scroll interne.
 *
 * Title + thumbnail via l'API publique JSON Reddit : `<url>.json`
 * (l'endpoint .json est public mais peut être rate-limité). Fallback
 * silencieux.
 */

const REDDIT_REGEX =
  /^(?:https?:\/\/)?(?:www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)\/comments\/([a-zA-Z0-9]+)(?:\/([^/?#]*))?/i;

export const redditExtractor: Extractor = async (url, ctx) => {
  const m = url.match(REDDIT_REGEX);
  if (!m) return { ok: false, reason: 'not_reddit' };
  const sub = m[1];
  const postId = m[2];
  const slug = m[3] || '';

  let title = `r/${sub}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  let description: string | undefined;
  try {
    // Construire URL JSON normalisée (sans paramètres parasites).
    const slugPart = slug ? `/${slug}` : '';
    const jsonUrl = `https://www.reddit.com/r/${sub}/comments/${postId}${slugPart}.json?raw_json=1`;
    // P2 polish audit #413 : UA Mozilla complet (Reddit rate-limite
    // agressivement les UA custom). Accept JSON explicite.
    const res = await fetch(jsonUrl, {
      signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        Accept: 'application/json,text/javascript;q=0.9,*/*;q=0.1',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (res.ok) {
      const j = (await res.json()) as unknown;
      if (Array.isArray(j) && j[0] && typeof j[0] === 'object') {
        const listing = j[0] as { data?: { children?: Array<{ data?: unknown }> } };
        const child = listing.data?.children?.[0];
        if (child && typeof child === 'object') {
          const d = (child as { data?: Record<string, unknown> }).data || {};
          const t = d.title;
          if (typeof t === 'string') title = t;
          const a = d.author;
          if (typeof a === 'string') authorName = `u/${a}`;
          const thumb = d.thumbnail;
          if (typeof thumb === 'string' && /^https?:/i.test(thumb))
            thumbnail = thumb;
          const selftext = d.selftext;
          if (typeof selftext === 'string' && selftext.length > 0) {
            description = selftext.slice(0, 280);
          }
        }
      }
    }
  } catch {
    /* silent */
  }

  const slugPart = slug ? `/${slug}` : '';
  const embedSrc = `https://embed.reddit.com/r/${sub}/comments/${postId}${slugPart}/?embed=true&showmore=false&theme=dark`;

  return {
    ok: true,
    card: {
      source: 'reddit',
      source_label: 'Reddit',
      type: 'discussion',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      description,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: embedSrc,
        height: 500,
        allow: 'encrypted-media',
      },
      meta: { sub, post_id: postId, slug },
      actions: [
        { kind: 'open', label: 'Voir sur Reddit', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
        { kind: 'comment', label: 'Commenter' },
      ],
    },
  };
};
