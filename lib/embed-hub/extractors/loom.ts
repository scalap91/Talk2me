import type { Extractor } from '../types';

/**
 * Loom extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : loom.com/share/<id>.
 * Embed : `loom.com/embed/<id>` (aspect 16/9 raisonnable, Loom adapte selon
 * la captation réelle).
 *
 * Pas d'oEmbed public Loom → title = "Loom · <id>".
 */

const LOOM_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?loom\.com\/share\/([a-zA-Z0-9]+)/i;

export const loomExtractor: Extractor = async (url, ctx) => {
  const m = url.match(LOOM_REGEX);
  if (!m) return { ok: false, reason: 'not_loom' };
  const videoId = m[1];

  // P2 polish audit #413 : Loom expose un oEmbed à
  // https://www.loom.com/v1/oembed?url=... qui renvoie title + thumb.
  let title = `Loom · ${videoId}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://www.loom.com/v1/oembed?url=${encodeURIComponent(url)}&format=json`,
      {
        signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
          Referer: 'https://talk2me.fr/',
          Accept: 'application/json',
        },
      }
    );
    if (oembedRes.ok) {
      const j = (await oembedRes.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      title = j.title || title;
      authorName = j.author_name;
      thumbnail = j.thumbnail_url;
    }
  } catch {
    /* silent */
  }

  return {
    ok: true,
    card: {
      source: 'loom',
      source_label: 'Loom',
      type: 'video',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://www.loom.com/embed/${videoId}?hide_owner=false&hide_share=false&hide_title=false&hideEmbedTopBar=false`,
        aspect_ratio: '16 / 9',
        allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
        allow_fullscreen: true,
      },
      meta: { video_id: videoId },
      actions: [
        { kind: 'open', label: 'Voir sur Loom', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
