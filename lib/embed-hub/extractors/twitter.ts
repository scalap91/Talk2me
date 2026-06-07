import type { Extractor } from '../types';

/**
 * Twitter / X extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : twitter.com/<user>/status/<id> et x.com/<user>/status/<id>.
 *
 * Embed officiel : oEmbed `https://publish.twitter.com/oembed?url=<URL>` →
 * retourne un blob HTML (`<blockquote>` + script widgets.js) qu'on injecte
 * dans un iframe sandbox via `srcDoc`. Type carte = `social_post`.
 *
 * Si oEmbed échoue (compte protégé, tweet supprimé, X rate limit), on remonte
 * `ok:false` pour que le hub bascule sur fallback.
 */

const TWITTER_REGEX =
  /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i;

function buildSrcDoc(oembedHtml: string): string {
  // Wrapper minimal pour iframe srcDoc : style transparent, centré.
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>html,body{margin:0;padding:0;background:transparent;}
body{display:flex;justify-content:center;align-items:flex-start;}
.twitter-tweet{margin:0!important;}</style>
</head><body>${oembedHtml}</body></html>`;
}

export const twitterExtractor: Extractor = async (url, ctx) => {
  const m = url.match(TWITTER_REGEX);
  if (!m) return { ok: false, reason: 'not_twitter' };
  const user = m[1];
  const tweetId = m[2];

  let oembedHtml = '';
  let authorName: string | undefined = user;
  try {
    const oembedRes = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=false&theme=dark&dnt=true`,
      {
        signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000),
        headers: { 'User-Agent': 'Mozilla/5.0 Talk2MeBot/1.0' },
      }
    );
    if (oembedRes.ok) {
      const j = (await oembedRes.json()) as {
        html?: string;
        author_name?: string;
      };
      oembedHtml = j.html || '';
      authorName = j.author_name || authorName;
    }
  } catch {
    /* silent */
  }

  if (!oembedHtml) {
    // X bloque souvent l'API publique. P2 polish audit #413 : tente
    // un fallback OG (au moins thumb + description) pour ne pas servir
    // une FallbackCard nue. Si OG marche aussi pas, on retourne quand
    // même la card sans embed (FallbackCard prendra le relais visuel).
    let ogTitle = `Tweet @${user}`;
    let ogDescription: string | undefined;
    let ogImage: string | undefined;
    try {
      const ogRes = await fetch(
        `${ctx.baseUrl}/api/og?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(ctx.resolverTimeoutMs || 5000) }
      );
      if (ogRes.ok) {
        const j = (await ogRes.json()) as {
          ok?: boolean;
          data?: { title?: string; description?: string; image?: string };
        };
        if (j?.ok && j?.data) {
          ogTitle = j.data.title || ogTitle;
          ogDescription = j.data.description;
          ogImage = j.data.image;
        }
      }
    } catch {
      /* silent */
    }
    return {
      ok: true,
      card: {
        source: 'twitter',
        source_label: 'X',
        type: 'social_post',
        title: ogTitle,
        description: ogDescription,
        thumbnail_url: ogImage,
        author: { name: `@${user}`, url: `https://x.com/${user}` },
        external_url: url,
        meta: { tweet_id: tweetId, user, oembed_failed: true },
        actions: [
          { kind: 'open', label: 'Voir sur X', url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  }

  return {
    ok: true,
    card: {
      source: 'twitter',
      source_label: 'X',
      type: 'social_post',
      title: `Tweet @${user}`,
      author: { name: `@${authorName}`, url: `https://x.com/${user}` },
      external_url: url,
      embed: {
        kind: 'custom',
        aspect_ratio: '1 / 1',
      },
      meta: { tweet_id: tweetId, user, oembed_html: oembedHtml, oembed_srcdoc: buildSrcDoc(oembedHtml) },
      actions: [
        { kind: 'open', label: 'Voir sur X', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
