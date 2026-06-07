import { parseUrl } from '../lib/url-parser.ts';

const urls = [
  ['Instagram post', 'https://www.instagram.com/p/CxbgKEsLPVD/'],
  ['Instagram reel', 'https://www.instagram.com/reel/Cz4q-RvNGYE/'],
  ['Instagram reels', 'https://www.instagram.com/reels/Cz4q-RvNGYE/'],
  ['SoundCloud track', 'https://soundcloud.com/forss/flickermood'],
  ['SoundCloud playlist', 'https://soundcloud.com/forss/sets/soulhack'],
  ['Vimeo', 'https://vimeo.com/76979871'],
  ['Vimeo player', 'https://player.vimeo.com/video/76979871'],
  ['Reddit', 'https://www.reddit.com/r/programming/comments/1d2example/example_post/'],
  ['Twitch clip', 'https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage'],
  ['Twitch channel', 'https://www.twitch.tv/zerator'],
  ['Twitch video', 'https://www.twitch.tv/videos/1234567890'],
  ['Twitch clip alt', 'https://www.twitch.tv/zerator/clip/AwkwardHelplessSalamanderSwiftRage'],
  ['Dailymotion', 'https://www.dailymotion.com/video/x7uof7w'],
  ['Dailymotion short', 'https://dai.ly/x7uof7w'],
  ['LinkedIn post', 'https://www.linkedin.com/posts/example-activity-7140000000000000000-abc'],
  ['LinkedIn feed', 'https://www.linkedin.com/feed/update/urn:li:share:7140000000000000000'],
  ['Pinterest', 'https://www.pinterest.com/pin/99360735500167749/'],
  ['Pinterest fr', 'https://fr.pinterest.com/pin/99360735500167749/'],
  ['Loom', 'https://www.loom.com/share/e883f70b219a49f6ba7fbeac71a72604'],
  ['Apple Music album', 'https://music.apple.com/fr/album/let-it-be/1440857781'],
  ['Apple Music song', 'https://music.apple.com/fr/album/let-it-be/1440857781?i=1440857786'],
  ['Deezer track', 'https://www.deezer.com/fr/track/3135556'],
  ['Deezer album', 'https://www.deezer.com/fr/album/302127'],
  ['Deezer no country', 'https://www.deezer.com/track/3135556'],
];

let pass = 0, fail = 0;
for (const [name, url] of urls) {
  const r = parseUrl(url);
  const ok = r.kind !== 'article' && r.kind !== 'unknown';
  console.log(`[${ok ? 'OK ' : 'KO '}] ${name.padEnd(28)} → kind=${r.kind} meta=${JSON.stringify(r.meta || {})}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass}/${urls.length} OK, ${fail} KO`);
