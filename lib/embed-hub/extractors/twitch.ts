import type { Extractor } from '../types';

/**
 * Twitch extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues :
 *  - clips.twitch.tv/<slug>            → clip
 *  - twitch.tv/<user>/clip/<slug>      → clip
 *  - twitch.tv/videos/<id>             → VOD
 *  - twitch.tv/<channel>               → live channel
 *
 * Embed : `player.twitch.tv/?...&parent=<host>` (parent OBLIGATOIRE sinon
 * Twitch refuse l'iframe, erreur 2000). On dérive `parent` depuis `ctx.baseUrl`.
 *
 * Pas d'oEmbed simple → title = "Twitch · <slug|channel>".
 */

const TWITCH_CLIP_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:clips\.twitch\.tv\/([^/?#]+)|twitch\.tv\/[^/]+\/clip\/([^/?#]+))/i;
const TWITCH_VIDEO_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/videos\/([0-9]+)/i;
const TWITCH_CHANNEL_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([a-zA-Z0-9_]+)\/?(?:[?#]|$)/i;

export const twitchExtractor: Extractor = async (url, ctx) => {
  // Dériver parent depuis le hostname PUBLIC (pas baseUrl interne).
  // Bug #2 audit #413 : Twitch refuse iframe si parent != Origin réel.
  // Priorité ctx.publicHostname > env > baseUrl > talk2me.fr.
  let parent =
    ctx.publicHostname ||
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    'talk2me.fr';
  // Si on a hérité de baseUrl 127.0.0.1/localhost, override sur prod.
  if (/^(127\.|localhost|0\.0\.0\.0)/i.test(parent)) {
    parent = process.env.NEXT_PUBLIC_APP_DOMAIN || 'talk2me.fr';
  }
  try {
    if (!ctx.publicHostname && ctx.baseUrl) {
      const fromBase = new URL(ctx.baseUrl).hostname;
      if (fromBase && !/^(127\.|localhost|0\.0\.0\.0)/i.test(fromBase)) {
        parent = fromBase;
      }
    }
  } catch {
    /* keep default */
  }
  // Strip port éventuel.
  parent = parent.split(':')[0];

  const clipMatch = url.match(TWITCH_CLIP_REGEX);
  if (clipMatch) {
    const slug = clipMatch[1] || clipMatch[2];
    return {
      ok: true,
      card: {
        source: 'twitch',
        source_label: 'Twitch',
        type: 'video',
        title: `Twitch · ${slug}`,
        external_url: url,
        embed: {
          kind: 'iframe',
          src: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${parent}&autoplay=false`,
          aspect_ratio: '16 / 9',
          allow:
            'autoplay; fullscreen; encrypted-media; picture-in-picture',
          allow_fullscreen: true,
        },
        meta: { twitch_kind: 'clip', clip_slug: slug },
        actions: [
          { kind: 'open', label: 'Voir sur Twitch', url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  }

  const videoMatch = url.match(TWITCH_VIDEO_REGEX);
  if (videoMatch) {
    const videoId = videoMatch[1];
    return {
      ok: true,
      card: {
        source: 'twitch',
        source_label: 'Twitch',
        type: 'video',
        title: `Twitch · vidéo ${videoId}`,
        external_url: url,
        embed: {
          kind: 'iframe',
          src: `https://player.twitch.tv/?video=${encodeURIComponent(videoId)}&parent=${parent}&autoplay=false`,
          aspect_ratio: '16 / 9',
          allow:
            'autoplay; fullscreen; encrypted-media; picture-in-picture',
          allow_fullscreen: true,
        },
        meta: { twitch_kind: 'video', video_id: videoId },
        actions: [
          { kind: 'open', label: 'Voir sur Twitch', url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  }

  const channelMatch = url.match(TWITCH_CHANNEL_REGEX);
  if (channelMatch) {
    const channel = channelMatch[1];
    return {
      ok: true,
      card: {
        source: 'twitch',
        source_label: 'Twitch',
        type: 'video',
        title: `Twitch · ${channel}`,
        external_url: url,
        embed: {
          kind: 'iframe',
          src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&autoplay=false`,
          aspect_ratio: '16 / 9',
          allow:
            'autoplay; fullscreen; encrypted-media; picture-in-picture',
          allow_fullscreen: true,
        },
        meta: { twitch_kind: 'channel', channel },
        actions: [
          { kind: 'open', label: 'Voir sur Twitch', url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  }

  return { ok: false, reason: 'not_twitch' };
};
