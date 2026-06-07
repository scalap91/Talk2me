import { parseUrl } from '../lib/url-parser.ts';

// Vérifications anti-regression : ces URLs NE doivent PAS matcher Twitch channel,
// LinkedIn, etc. et doivent rester sur leur kind d'origine.
const cases = [
  ['YouTube reste youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
  ['TikTok reste tiktok', 'https://www.tiktok.com/@user/video/7234567890123456789', 'tiktok'],
  ['Spotify reste spotify', 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', 'spotify'],
  ['Twitter reste twitter', 'https://twitter.com/user/status/1234567890', 'twitter'],
  ['Facebook reste facebook', 'https://www.facebook.com/share/v/abc123/', 'facebook'],
  ['URL Github article', 'https://github.com/user/repo', 'article'],
  ['Maps reste maps', 'https://maps.app.goo.gl/abc', 'maps'],
  ['Twitch channel pas videos', 'https://www.twitch.tv/videos/1234567890', 'twitch'],
  // L'URL videos doit être détectée comme video kind (pas channel)
];

let pass = 0, fail = 0;
for (const [name, url, expected] of cases) {
  const r = parseUrl(url);
  const ok = r.kind === expected;
  console.log(`[${ok ? 'OK ' : 'KO '}] ${name.padEnd(35)} expected=${expected} got=${r.kind} ${ok ? '' : 'meta=' + JSON.stringify(r.meta)}`);
  if (ok) pass++; else fail++;
}
// Detail: vérifions le sous-type twitch.tv/videos/<id>
const v = parseUrl('https://www.twitch.tv/videos/1234567890');
console.log(`\nTwitch videos detail: twitchKind=${v.meta?.twitchKind} videoId=${v.meta?.videoId}`);
console.log(`\n${pass}/${cases.length} OK, ${fail} KO`);
