import type { Extractor } from '../types';

/**
 * YouTube extractor — Universal Embed Hub Phase 1.
 *
 * Détecte watch?v=, embed/, shorts/, youtu.be/. oEmbed YouTube est public
 * (pas de clé API), on l'utilise pour title/author/thumbnail. Si oEmbed
 * tombe, on dégrade silencieusement vers un titre par défaut (doctrine
 * `feedback_talktome_no_excuses` : pas d'erreur brute).
 */

const YT_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

export const youtubeExtractor: Extractor = async (url, ctx) => {
  const m = url.match(YT_REGEX);
  if (!m) return { ok: false, reason: 'not_youtube' };
  const videoId = m[1];

  // Optional: fetch oEmbed pour title/author/thumbnail
  let title = 'Vidéo YouTube';
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
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
    /* silent fallback */
  }

  return {
    ok: true,
    card: {
      source: 'youtube',
      source_label: 'YouTube',
      type: 'video',
      title,
      author: authorName
        ? {
            name: authorName,
            url: `https://www.youtube.com/@${authorName}`,
          }
        : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        // enablejsapi=1 nécessaire pour que UnifiedCardRenderer puisse
        // postMessage `pauseVideo` lors d'un audioChannel.request d'un
        // autre participant (doctrine #337 audio exclusif).
        src: `https://www.youtube.com/embed/${videoId}?enablejsapi=1`,
        aspect_ratio: '16 / 9',
        allow:
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allow_fullscreen: true,
      },
      meta: { video_id: videoId },
      actions: [
        { kind: 'open', label: 'Voir sur YouTube', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
