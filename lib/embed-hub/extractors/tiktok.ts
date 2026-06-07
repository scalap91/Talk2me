import type { Extractor } from '../types';

/**
 * TikTok extractor — Universal Embed Hub Phase 1.
 *
 * Réutilise le résolveur `/api/tiktok-resolve` existant pour traduire les
 * shortcodes `vm.tiktok.com/<short>` en URL longue numérique exigée par
 * le player TikTok officiel.
 */

const TIKTOK_NUMERIC = /tiktok\.com\/@([^/]+)\/video\/(\d+)/i;
const TIKTOK_SHORT =
  /^(?:https?:\/\/)?(?:vm\.tiktok\.com\/|tiktok\.com\/t\/)([a-zA-Z0-9]+)/i;

export const tiktokExtractor: Extractor = async (url, ctx) => {
  if (!TIKTOK_NUMERIC.test(url) && !TIKTOK_SHORT.test(url)) {
    return { ok: false, reason: 'not_tiktok' };
  }

  let videoId: string | undefined;
  let user: string | undefined;

  const numericMatch = url.match(TIKTOK_NUMERIC);
  if (numericMatch) {
    user = numericMatch[1];
    videoId = numericMatch[2];
  } else {
    // Resolve shortcode via le sub-endpoint Talk2Me
    try {
      const res = await fetch(
        `${ctx.baseUrl}/api/tiktok-resolve?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
      );
      if (res.ok) {
        const j = (await res.json()) as {
          ok?: boolean;
          data?: { video_id?: string; user?: string };
        };
        if (j?.ok && j?.data?.video_id) {
          videoId = j.data.video_id;
          user = j.data.user;
        }
      }
    } catch {
      /* silent */
    }
  }

  if (!videoId) return { ok: false, reason: 'resolve_failed' };

  return {
    ok: true,
    card: {
      source: 'tiktok',
      source_label: 'TikTok',
      type: 'video',
      title: user ? `TikTok @${user}` : 'Vidéo TikTok',
      author: user
        ? { name: `@${user}`, url: `https://www.tiktok.com/@${user}` }
        : undefined,
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1`,
        aspect_ratio: '9 / 16',
        allow:
          'fullscreen; encrypted-media; picture-in-picture; web-share',
        allow_fullscreen: true,
      },
      meta: { video_id: videoId, user },
      actions: [
        { kind: 'open', label: 'Voir sur TikTok', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
