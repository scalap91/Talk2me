#!/usr/bin/env node
/**
 * Talk2Me #380 Phase 2-3 — E2E Universal Embed Hub.
 * Pour chaque URL test, GET /api/embed-hub et vérifie : ok, card.source,
 * card.title, card.external_url, card.actions présents. Compte les fallbacks.
 */

const BASE = 'http://localhost:3010';

const TESTS = [
  // ─── Vidéo ─────────────────────────────────────────────────────────────
  { label: 'YouTube',         expect: 'youtube',     url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'TikTok',          expect: 'tiktok',      url: 'https://vm.tiktok.com/ZNRv1WvPW/' },
  { label: 'Vimeo',           expect: 'vimeo',       url: 'https://vimeo.com/76979871' },
  { label: 'Dailymotion',     expect: 'dailymotion', url: 'https://www.dailymotion.com/video/x2hwqn9' },
  { label: 'Twitch channel',  expect: 'twitch',      url: 'https://www.twitch.tv/twitch' },
  { label: 'Loom',            expect: 'loom',        url: 'https://www.loom.com/share/4cf73aaee29c4c91a93ea53bf7e3a85e' },
  // ─── Audio ─────────────────────────────────────────────────────────────
  { label: 'Spotify',         expect: 'spotify',     url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b' },
  { label: 'SoundCloud',      expect: 'soundcloud',  url: 'https://soundcloud.com/forss/flickermood' },
  { label: 'Apple Music',     expect: 'apple-music', url: 'https://music.apple.com/us/album/1989-taylors-version/1713845538' },
  { label: 'Deezer',          expect: 'deezer',      url: 'https://www.deezer.com/track/3135556' },
  // ─── Social ────────────────────────────────────────────────────────────
  { label: 'X (Twitter)',     expect: 'twitter',     url: 'https://twitter.com/Twitter/status/1445078208190291973' },
  { label: 'Facebook',        expect: 'facebook',    url: 'https://www.facebook.com/zuck/posts/10114974887523891' },
  { label: 'Instagram',       expect: 'instagram',   url: 'https://www.instagram.com/p/CXJjBhPI3qf/' },
  { label: 'LinkedIn (URN)',  expect: 'linkedin',    url: 'https://www.linkedin.com/feed/update/urn:li:share:6660595489049497600' },
  { label: 'Pinterest',       expect: 'pinterest',   url: 'https://www.pinterest.com/pin/99360735500167749/' },
  { label: 'Reddit',          expect: 'reddit',      url: 'https://www.reddit.com/r/programming/comments/1c2x3y/example_post/' },
  // ─── Place ─────────────────────────────────────────────────────────────
  { label: 'Google Maps',     expect: 'maps',        url: 'https://www.google.com/maps/place/Tour+Eiffel/@48.8583701,2.2944813,17z' },
];

async function runOne(t) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/embed-hub?url=${encodeURIComponent(t.url)}`);
    const j = await res.json();
    const dt = Date.now() - t0;
    if (!j.ok || !j.card) {
      return { ...t, ok: false, dt, reason: 'no_card' };
    }
    const c = j.card;
    const hasOpen = Array.isArray(c.actions) && c.actions.some((a) => a.kind === 'open');
    const hasEmbed = !!c.embed;
    const isFallback = c.source === 'fallback' || c.meta?.fallback === true;
    const validSource = c.source === t.expect || (isFallback && t.expect === 'fallback');
    return {
      ...t,
      ok: !!c.title && !!c.external_url && hasOpen,
      dt,
      source: c.source,
      hasEmbed,
      isFallback,
      validSource,
      title: c.title.slice(0, 60),
    };
  } catch (e) {
    return { ...t, ok: false, dt: Date.now() - t0, reason: 'exception', message: String(e) };
  }
}

(async () => {
  const results = [];
  for (const t of TESTS) {
    const r = await runOne(t);
    results.push(r);
    const flag = r.ok ? (r.validSource ? '[OK]' : '[OK-fallback]') : '[KO]';
    const fb = r.isFallback ? ' (fallback)' : '';
    const emb = r.hasEmbed ? ' embed' : ' no-embed';
    console.log(
      `${flag} ${t.label.padEnd(18)} ${String(r.dt).padStart(5)}ms  ${r.source || 'X'}${emb}${fb}  "${r.title || r.reason || ''}"`
    );
  }
  const okCount = results.filter((r) => r.ok).length;
  const fallbackCount = results.filter((r) => r.isFallback).length;
  const embedCount = results.filter((r) => r.hasEmbed && !r.isFallback).length;
  console.log('');
  console.log(`Résultat: ${okCount}/${TESTS.length} cards retournées valides`);
  console.log(`         ${embedCount} avec embed riche, ${fallbackCount} en fallback gracieux`);
  process.exit(okCount === TESTS.length ? 0 : 1);
})();
