import type { Extractor } from '../types';

/**
 * SoundCloud extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues :
 *  - soundcloud.com/<artist>/<track>             → track   (height 166)
 *  - soundcloud.com/<artist>/sets/<playlist>     → playlist (height 400)
 *
 * Embed : `w.soundcloud.com/player/?url=<canonicalUrl>` (officiel widget).
 * Title via oEmbed `https://soundcloud.com/oembed?format=json&url=<URL>`.
 */

const SOUNDCLOUD_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.|on\.)?soundcloud\.com\/([^/]+)\/(sets\/)?([^/?#]+)/i;

export const soundcloudExtractor: Extractor = async (url, ctx) => {
  const m = url.match(SOUNDCLOUD_REGEX);
  if (!m) return { ok: false, reason: 'not_soundcloud' };
  const artist = m[1];
  const isPlaylist = !!m[2];
  const slug = m[3];
  const type = isPlaylist ? 'playlist' : 'track';
  const height = isPlaylist ? 400 : 166;

  // Normaliser sur host canonique soundcloud.com (le widget exige une URL publique).
  const canonicalUrl = isPlaylist
    ? `https://soundcloud.com/${artist}/sets/${slug}`
    : `https://soundcloud.com/${artist}/${slug}`;

  let title = isPlaylist
    ? `SoundCloud · playlist ${slug}`
    : `SoundCloud · ${slug}`;
  let authorName: string | undefined = artist;
  let thumbnail: string | undefined;

  try {
    const oembedRes = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(
        canonicalUrl
      )}`,
      { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
    );
    if (oembedRes.ok) {
      const j = (await oembedRes.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      title = j.title || title;
      authorName = j.author_name || authorName;
      thumbnail = j.thumbnail_url;
    }
  } catch {
    /* silent */
  }

  const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    canonicalUrl
  )}&color=%237c3aed&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false${
    isPlaylist ? '&visual=false' : ''
  }`;

  return {
    ok: true,
    card: {
      source: 'soundcloud',
      source_label: 'SoundCloud',
      type: 'audio',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: widgetUrl,
        height,
        allow: 'autoplay; encrypted-media',
      },
      meta: { soundcloud_type: type, canonical_url: canonicalUrl },
      actions: [
        { kind: 'open', label: 'Écouter sur SoundCloud', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
