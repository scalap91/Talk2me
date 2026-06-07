/**
 * Talk2Me #409 — Checks Embed Hub extractors.
 *
 * Vérifie via inspection source que chaque extracteur est bien déclaré dans
 * /lib/embed-hub/registry.ts. Pas d'appel réseau aux plateformes tierces
 * (coûteux, rate-limited, fragile).
 */

import { fileContains } from '../_helpers.mjs';

function checkExtractor(name, expectImportName) {
  return async () => {
    const t0 = Date.now();
    const reg = fileContains(
      'lib/embed-hub/registry.ts',
      new RegExp(`name:\\s*['"]${name}['"]`),
    );
    const file = `lib/embed-hub/extractors/${name}.ts`;
    const fileExists = fileContains(file, 'extractor');
    const passed = reg.matched && fileExists.exists;
    return {
      passed,
      duration_ms: Date.now() - t0,
      error: passed ? null : `Extracteur ${name} introuvable (registry=${reg.matched} file=${fileExists.exists})`,
      evidence: { name, registry_match: reg.matched, file_exists: fileExists.exists },
    };
  };
}

export const CHECKS = [
  { FEATURE: { id: 'embed-youtube' }, run: checkExtractor('youtube') },
  { FEATURE: { id: 'embed-tiktok' }, run: checkExtractor('tiktok') },
  { FEATURE: { id: 'embed-spotify' }, run: checkExtractor('spotify') },
  { FEATURE: { id: 'embed-soundcloud' }, run: checkExtractor('soundcloud') },
  { FEATURE: { id: 'embed-apple-music' }, run: checkExtractor('apple-music') },
  { FEATURE: { id: 'embed-deezer' }, run: checkExtractor('deezer') },
  { FEATURE: { id: 'embed-vimeo' }, run: checkExtractor('vimeo') },
  { FEATURE: { id: 'embed-dailymotion' }, run: checkExtractor('dailymotion') },
  { FEATURE: { id: 'embed-twitch' }, run: checkExtractor('twitch') },
  { FEATURE: { id: 'embed-loom' }, run: checkExtractor('loom') },
  { FEATURE: { id: 'embed-twitter' }, run: checkExtractor('twitter') },
  { FEATURE: { id: 'embed-facebook' }, run: checkExtractor('facebook') },
  { FEATURE: { id: 'embed-instagram' }, run: checkExtractor('instagram') },
  { FEATURE: { id: 'embed-linkedin' }, run: checkExtractor('linkedin') },
  { FEATURE: { id: 'embed-pinterest' }, run: checkExtractor('pinterest') },
  { FEATURE: { id: 'embed-reddit' }, run: checkExtractor('reddit') },
  { FEATURE: { id: 'embed-maps' }, run: checkExtractor('maps') },
  {
    FEATURE: { id: 'embed-article-fallback' },
    run: async () => {
      const t0 = Date.now();
      // L'article est le fallback : pas dans EXTRACTORS, mais articleExtractor doit exister
      const ext = fileContains('lib/embed-hub/extractors/article.ts', 'articleExtractor');
      const fallback = fileContains('lib/embed-hub/registry.ts', 'articleExtractor');
      const passed = ext.exists && ext.matched && fallback.matched;
      return {
        passed,
        duration_ms: Date.now() - t0,
        error: passed ? null : `Article fallback introuvable (ext=${ext.matched} fallback=${fallback.matched})`,
        evidence: { ext_match: ext.matched, fallback_match: fallback.matched },
      };
    },
  },
];
