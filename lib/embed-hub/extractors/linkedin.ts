import type { Extractor } from '../types';

/**
 * LinkedIn extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues : linkedin.com/posts/<slug> ou linkedin.com/feed/update/<urn>.
 *
 * Le slug `posts/<...>` contient souvent l'`activity-<id>` ou `share-<id>`
 * qu'on convertit en URN `urn:li:share:<id>` / `urn:li:activity:<id>`.
 *
 * Embed officiel : `linkedin.com/embed/feed/update/<urn>` (hauteur ~540).
 *
 * Si l'URN n'est pas extractible → ok:false (le hub bascule sur fallback OG).
 */

const LINKEDIN_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:posts\/[^/?#]+|feed\/update\/[^/?#]+)/i;

/**
 * Extrait UNIQUEMENT les URNs LinkedIn explicites (format
 * `urn:li:activity:...` ou `urn:li:share:...` présent tel quel dans l'URL).
 *
 * Bug #4 audit #413 (Pascal 2026-06-05) : on n'invente PLUS d'URN à partir
 * de chiffres trouvés dans le slug `posts/foo-activity-12345-abcd` ; ces
 * chiffres ne sont qu'un identifiant tronqué et l'URN reconstitué génère
 * une iframe 404. Sans URN explicite → fallback OG via card sans embed.
 */
function extractUrn(url: string): string | null {
  const urnShare = url.match(/urn(?::|%3A)li(?::|%3A)share(?::|%3A)([0-9]+)/i);
  if (urnShare) return `urn:li:share:${urnShare[1]}`;
  const urnActivity = url.match(
    /urn(?::|%3A)li(?::|%3A)activity(?::|%3A)([0-9]+)/i
  );
  if (urnActivity) return `urn:li:activity:${urnActivity[1]}`;
  // PAS de fallback `activity-XXX` depuis le slug : URN incomplet =
  // iframe LinkedIn 404. Mieux vaut FallbackCard avec lien.
  return null;
}

export const linkedinExtractor: Extractor = async (url, ctx) => {
  if (!LINKEDIN_REGEX.test(url)) return { ok: false, reason: 'not_linkedin' };

  const urn = extractUrn(url);
  if (!urn) {
    // Pas d'URN explicite → tente d'enrichir via OpenGraph (l'oEmbed
    // LinkedIn pour posts publics n'existe pas sans auth). Si OG marche,
    // on a au moins un titre + thumb. Bug #4 audit #413.
    let ogTitle = 'Post LinkedIn';
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
      /* silent : on garde le fallback titre générique */
    }
    return {
      ok: true,
      card: {
        source: 'linkedin',
        source_label: 'LinkedIn',
        type: 'social_post',
        title: ogTitle,
        description: ogDescription,
        thumbnail_url: ogImage,
        external_url: url,
        meta: { urn_missing: true },
        actions: [
          { kind: 'open', label: 'Voir sur LinkedIn', url },
          { kind: 'share', label: 'Partager' },
          { kind: 'save', label: 'Enregistrer' },
        ],
      },
    };
  }

  return {
    ok: true,
    card: {
      source: 'linkedin',
      source_label: 'LinkedIn',
      type: 'social_post',
      title: 'Post LinkedIn',
      external_url: url,
      embed: {
        kind: 'iframe',
        src: `https://www.linkedin.com/embed/feed/update/${encodeURIComponent(urn)}`,
        height: 540,
        allow: 'encrypted-media',
      },
      meta: { urn },
      actions: [
        { kind: 'open', label: 'Voir sur LinkedIn', url },
        { kind: 'share', label: 'Partager' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    },
  };
};
