import type { Extractor } from '../types';

/**
 * Deezer extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : deezer.com/[<lang>/]<type>/<id> avec type ∈ {track, album,
 * playlist, artist, episode, show}.
 *
 * Embed officiel : widget.deezer.com/widget/dark/<type>/<id>.
 * Hauteur :
 *  - track    → 92
 *  - playlist → 300 (track-list)
 *  - autres   → 300
 */

const DEEZER_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist|episode|show)\/([0-9]+)/i;

const HEIGHT: Record<string, number> = {
  track: 92,
  album: 300,
  playlist: 300,
  artist: 300,
  episode: 200,
  show: 300,
};

export const deezerExtractor: Extractor = async (url, ctx) => {
  const m = url.match(DEEZER_REGEX);
  if (!m) return { ok: false, reason: 'not_deezer' };
  const type = m[1].toLowerCase();
  const id = m[2];
  const height = HEIGHT[type] ?? 300;

  // P2 polish audit #413 : Deezer expose un oEmbed officiel à
  // https://api.deezer.com/oembed?url=... qui renvoie title/author_name/
  // thumbnail_url. On l'appelle pour enrichir le titre (au lieu de
  // "Deezer · track 12345" générique).
  let title = `Deezer · ${type} ${id}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://api.deezer.com/oembed?url=${encodeURIComponent(url)}&format=json`,
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
      source: 'deezer',
      source_label: 'Deezer',
      type: 'audio',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://widget.deezer.com/widget/dark/${type}/${id}`,
        height,
        allow: 'autoplay; encrypted-media; clipboard-write',
      },
      meta: { deezer_type: type, deezer_id: id },
      actions: [
        { kind: 'open', label: 'Écouter sur Deezer', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
