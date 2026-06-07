import type { Extractor } from '../types';

/**
 * Vimeo extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : vimeo.com/<id>, vimeo.com/video/<id>,
 * vimeo.com/channels/<chan>/<id>, player.vimeo.com/video/<id>.
 *
 * Embed : `player.vimeo.com/video/<id>` (aspect 16/9 standard).
 * Title via oEmbed `https://vimeo.com/api/oembed.json?url=<URL>`.
 */

const VIMEO_REGEX =
  /^(?:https?:\/\/)?(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[^/]+\/)?([0-9]+)/i;

export const vimeoExtractor: Extractor = async (url, ctx) => {
  const m = url.match(VIMEO_REGEX);
  if (!m) return { ok: false, reason: 'not_vimeo' };
  const videoId = m[1];

  let title = `Vimeo · ${videoId}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  let description: string | undefined;
  try {
    // P2 polish audit #413 : UA Mozilla + Referer talk2me.fr pour
    // contourner les filtres anti-bot de Vimeo oEmbed.
    const oembedRes = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
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
        author_url?: string;
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
      source: 'vimeo',
      source_label: 'Vimeo',
      type: 'video',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      description,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://player.vimeo.com/video/${videoId}?api=1&player_id=vimeo-${videoId}`,
        aspect_ratio: '16 / 9',
        allow:
          'autoplay; fullscreen; encrypted-media; picture-in-picture',
        allow_fullscreen: true,
      },
      meta: { video_id: videoId },
      actions: [
        { kind: 'open', label: 'Voir sur Vimeo', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
