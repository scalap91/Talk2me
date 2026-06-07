import type { Extractor } from '../types';

/**
 * Apple Music extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : music.apple.com/<country>/(album|playlist|song|music-video)/<slug>/<id>[?i=<trackId>]
 *
 * Embed : on remplace `music.apple.com` par `embed.music.apple.com`, en
 * conservant le `?i=<trackId>` pour pointer une piste dans un album.
 *
 * Hauteur :
 *  - song / track-in-album (?i=…)  → 175
 *  - album / playlist              → 450
 *  - music-video                   → 16/9 aspect-ratio (height non utilisé)
 *
 * Apple n'expose pas d'oEmbed public stable ; on extrait le titre depuis le
 * slug URL (souvent décodable kebab-case).
 */

const APPLE_MUSIC_REGEX =
  /^(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(album|playlist|song|music-video)\/([^/]+)\/([0-9]+)(?:\?i=([0-9]+))?/i;

function slugToTitle(slug: string): string {
  try {
    return decodeURIComponent(slug)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return slug;
  }
}

export const appleMusicExtractor: Extractor = async (url, ctx) => {
  const m = url.match(APPLE_MUSIC_REGEX);
  if (!m) return { ok: false, reason: 'not_apple_music' };
  const country = m[1];
  const type = m[2].toLowerCase();
  const slug = m[3];
  const id = m[4];
  const trackId = m[5] || '';

  const isVideo = type === 'music-video';
  const isSingleTrack = type === 'song' || !!trackId;
  const height = isSingleTrack ? 175 : 450;

  const embedHost = 'https://embed.music.apple.com';
  const embedType = type === 'song' ? 'album' : type;
  let embedSrc = `${embedHost}/${country}/${embedType}/${slug}/${id}`;
  const params = new URLSearchParams();
  params.set('app', 'music');
  if (trackId) params.set('i', trackId);
  embedSrc += `?${params.toString()}`;

  // P2 polish audit #413 : Apple Music n'a pas d'oEmbed mais la page
  // expose un OG riche (og:title = vrai titre, og:image = artwork).
  // On enrichit via /api/og pour avoir mieux que le slug-Title.
  let title = `Apple Music · ${slugToTitle(slug)}`;
  let thumbnail: string | undefined;
  try {
    const ogRes = await fetch(
      `${ctx.baseUrl}/api/og?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
    );
    if (ogRes.ok) {
      const j = (await ogRes.json()) as {
        ok?: boolean;
        data?: { title?: string; image?: string };
      };
      if (j?.ok && j?.data) {
        if (j.data.title) title = j.data.title;
        thumbnail = j.data.image;
      }
    }
  } catch {
    /* silent */
  }

  return {
    ok: true,
    card: {
      source: 'apple-music',
      source_label: 'Apple Music',
      type: isVideo ? 'video' : 'audio',
      title,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: embedSrc,
        ...(isVideo
          ? { aspect_ratio: '16 / 9', allow_fullscreen: true }
          : { height }),
        allow:
          'autoplay *; encrypted-media *; clipboard-write; fullscreen *',
      },
      meta: {
        apple_country: country,
        apple_type: type,
        apple_id: id,
        ...(trackId ? { apple_track_id: trackId } : {}),
      },
      actions: [
        { kind: 'open', label: 'Écouter sur Apple Music', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
