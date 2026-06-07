import type { Extractor } from '../types';

/**
 * Spotify extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : open.spotify.com/{track|album|playlist|episode|show|artist}/<id>.
 * Embed officiel : open.spotify.com/embed/<type>/<id>. Hauteur :
 *  - track / episode / artist     → 152
 *  - album / playlist / show      → 380
 * Title via oEmbed `https://open.spotify.com/oembed?url=<URL>` (public,
 * pas de clé). Si oEmbed échoue → fallback silencieux sur "Spotify · <type>".
 */

const SPOTIFY_REGEX =
  /^(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)/i;

// Spotify IDs sont des base62 de 22 chars (validé sur catalogue 2026).
// Bug #6 audit #413 : valider la longueur évite oEmbed 5s sur ID invalide
// + iframe vide. Pascal 2026-06-05.
const SPOTIFY_ID_REGEX = /^[A-Za-z0-9]{22}$/;

const HEIGHT: Record<string, number> = {
  track: 152,
  episode: 152,
  artist: 152,
  album: 380,
  playlist: 380,
  show: 380,
};

// Timeout oEmbed dédié : Spotify oEmbed est connu pour pendre jusqu'à 5s
// sur certains contenus (régression observée audit #413). 2s = compromis
// raisonnable (le titre est un nice-to-have, pas un blocker).
const SPOTIFY_OEMBED_TIMEOUT_MS = 2000;

export const spotifyExtractor: Extractor = async (url, ctx) => {
  const m = url.match(SPOTIFY_REGEX);
  if (!m) return { ok: false, reason: 'not_spotify' };
  const type = m[1].toLowerCase();
  const id = m[2];

  // Bug #6 : ID invalide (≠ 22 chars) → fallback immédiat, pas d'oEmbed
  // ni d'iframe (Spotify renvoie "Track not found" silencieusement).
  if (!SPOTIFY_ID_REGEX.test(id)) {
    return { ok: false, reason: 'invalid_spotify_id' };
  }

  const height = HEIGHT[type] ?? 152;

  let title = `Spotify · ${type}`;
  let authorName: string | undefined;
  let thumbnail: string | undefined;
  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(
          Math.min(ctx.resolverTimeoutMs || 5000, SPOTIFY_OEMBED_TIMEOUT_MS)
        ),
      }
    );
    if (oembedRes.ok) {
      const j = (await oembedRes.json()) as {
        title?: string;
        provider_name?: string;
        thumbnail_url?: string;
        author_name?: string;
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
      source: 'spotify',
      source_label: 'Spotify',
      type: 'audio',
      title,
      author: authorName ? { name: authorName } : undefined,
      thumbnail_url: thumbnail,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
        height,
        allow:
          'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
      },
      meta: { spotify_type: type, spotify_id: id },
      actions: [
        { kind: 'open', label: 'Écouter sur Spotify', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
