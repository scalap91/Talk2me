import type { Extractor } from '../types';

/**
 * Dailymotion extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : dailymotion.com/video/<id>, dailymotion.com/embed/video/<id>,
 * dai.ly/<id>.
 *
 * Embed : `dailymotion.com/embed/video/<id>` (aspect 16/9).
 * Title via oEmbed `https://www.dailymotion.com/services/oembed?url=<URL>`.
 */

const DAILYMOTION_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?(?:dailymotion\.com\/(?:video\/|embed\/video\/)([a-zA-Z0-9]+)|dai\.ly\/([a-zA-Z0-9]+))/i;

export const dailymotionExtractor: Extractor = async (url, ctx) => {
  const m = url.match(DAILYMOTION_REGEX);
  if (!m) return { ok: false, reason: 'not_dailymotion' };
  const videoId = m[1] || m[2] || '';
  if (!videoId) return { ok: false, reason: 'no_video_id' };

  let title = `Dailymotion · ${videoId}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
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
      source: 'dailymotion',
      source_label: 'Dailymotion',
      type: 'video',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://www.dailymotion.com/embed/video/${videoId}?api=postMessage&autoplay=0`,
        aspect_ratio: '16 / 9',
        allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
        allow_fullscreen: true,
      },
      meta: { video_id: videoId },
      actions: [
        { kind: 'open', label: 'Voir sur Dailymotion', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
