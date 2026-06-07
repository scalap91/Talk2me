export type UrlKind =
  | 'youtube'
  | 'tiktok'
  | 'spotify'
  | 'maps'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'soundcloud'
  | 'vimeo'
  | 'reddit'
  | 'twitch'
  | 'dailymotion'
  | 'linkedin'
  | 'pinterest'
  | 'loom'
  | 'applemusic'
  | 'deezer'
  | 'pdf'
  | 'image'
  | 'article'
  | 'unknown';

export interface ParsedUrl {
  kind: UrlKind;
  originalUrl: string;
  embedUrl?: string;
  meta?: Record<string, string>;
}

// Talk2Me #370 — tous les regex tolèrent un slash final optionnel `\/?`
// Bug Pascal 2026-06-05 : vm.tiktok.com/ZNRv1WvPW/ (slash terminal du partage natif) rejeté.
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})\/?(?:[?&#].*)?$/;
const TIKTOK_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@([^/]+)\/video\/(\d+)|vm\.tiktok\.com\/([a-zA-Z0-9]+)|tiktok\.com\/t\/([a-zA-Z0-9]+))\/?(?:[?&#].*)?$/;
const SPOTIFY_REGEX = /^(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)\/?(?:[?&#].*)?$/;
const MAPS_REGEX = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*google\.[a-z.]+\/maps(?:\/|\?)|^(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i;
const TWITTER_REGEX = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)\/?(?:[?&#].*)?$/;
// Talk2Me 2026-06-05 (Pascal) — Facebook embeds.
// Patterns supportés :
//   - facebook.com/share/<token>/         (lien de partage natif app)
//   - facebook.com/share/v/<token>/       (variante vidéo)
//   - facebook.com/share/p/<token>/       (variante post)
//   - facebook.com/share/r/<token>/       (variante reel)
//   - facebook.com/<user>/posts/<id>
//   - facebook.com/<user>/videos/<id>
//   - facebook.com/<user>/photos/<id>
//   - facebook.com/photo.php?fbid=<id>
//   - facebook.com/watch?v=<id>
//   - facebook.com/reel/<id>
//   - fb.watch/<token>
//   - m.facebook.com/... (mobile)
// Slash final toléré (cf #370).
const FACEBOOK_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com\/(?:share(?:\/[vpr])?\/[a-zA-Z0-9]+|[a-zA-Z0-9.]+\/(?:posts|videos|photos)\/[a-zA-Z0-9]+|photo\.php|watch\/?\?v=[0-9]+|reel\/[0-9]+)|fb\.watch\/[a-zA-Z0-9_-]+)\/?(?:[?&#].*)?$/i;

// Talk2Me 2026-06-05 (Pascal) — 10 nouvelles plateformes.
// Slash final toléré sur toutes (cf #370).
const INSTAGRAM_REGEX = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)\/?(?:[?&#].*)?$/i;
// SoundCloud : artist/track OU artist/sets/playlist
const SOUNDCLOUD_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.|on\.)?soundcloud\.com\/([^/]+)\/(sets\/)?([^/?#]+)\/?(?:[?&#].*)?$/i;
const VIMEO_REGEX = /^(?:https?:\/\/)?(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[^/]+\/)?([0-9]+)\/?(?:[?&#].*)?$/i;
// Reddit : doit avoir un comments/<id> pour être embeddable.
const REDDIT_REGEX = /^(?:https?:\/\/)?(?:www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)\/comments\/([a-zA-Z0-9]+)(?:\/([^/?#]*))?\/?(?:[?&#].*)?$/i;
// Twitch clip : checké AVANT channel (sinon channel matche tout).
const TWITCH_CLIP_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:clips\.twitch\.tv\/([^/?#]+)|twitch\.tv\/[^/]+\/clip\/([^/?#]+))\/?(?:[?&#].*)?$/i;
// Twitch video (VOD) : twitch.tv/videos/<id>
const TWITCH_VIDEO_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/videos\/([0-9]+)\/?(?:[?&#].*)?$/i;
const TWITCH_CHANNEL_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([a-zA-Z0-9_]+)\/?(?:[?&#].*)?$/i;
const DAILYMOTION_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:dailymotion\.com\/(?:video\/|embed\/video\/)([a-zA-Z0-9]+)|dai\.ly\/([a-zA-Z0-9]+))\/?(?:[?&#].*)?$/i;
// LinkedIn : posts/<slug> (slug contient souvent l'urn:li:share:<id>),
// feed/update/urn:li:share:<id>, ou feed/update/urn:li:activity:<id>
const LINKEDIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:posts\/[^/?#]+|feed\/update\/[^/?#]+)\/?(?:[?&#].*)?$/i;
const PINTEREST_REGEX = /^(?:https?:\/\/)?(?:[a-z]{2}\.|www\.)?pinterest\.[a-z.]+\/pin\/([0-9]+)\/?(?:[?&#].*)?$/i;
const LOOM_REGEX = /^(?:https?:\/\/)?(?:www\.)?loom\.com\/share\/([a-zA-Z0-9]+)\/?(?:[?&#].*)?$/i;
// Apple Music : music.apple.com/<country>/<type>/<slug>/<id>[?i=<trackId>]
const APPLE_MUSIC_REGEX = /^(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(album|playlist|song|music-video)\/[^/]+\/([0-9]+)(?:\?i=([0-9]+))?\/?(?:[?&#].*)?$/i;
// Deezer : deezer.com/[fr/]<type>/<id>
const DEEZER_REGEX = /^(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist|episode|show)\/([0-9]+)\/?(?:[?&#].*)?$/i;

const PDF_REGEX = /\.pdf(?:\?.*)?$/i;
const IMAGE_REGEX = /\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?.*)?$/i;

function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function parseYoutube(url: string): ParsedUrl {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return { kind: 'unknown', originalUrl: url };
  }
  return {
    kind: 'youtube',
    originalUrl: url,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    meta: { videoId },
  };
}

function parseTiktok(url: string): ParsedUrl {
  const match = url.match(TIKTOK_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const meta: Record<string, string> = {};
  if (match[1] && match[2]) {
    meta.user = match[1];
    meta.videoId = match[2];
  } else if (match[3]) {
    meta.videoId = match[3];
  } else if (match[4]) {
    meta.videoId = match[4];
  }
  return {
    kind: 'tiktok',
    originalUrl: url,
    meta,
  };
}

function parseSpotify(url: string): ParsedUrl {
  const match = url.match(SPOTIFY_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const type = match[1];
  const id = match[2];
  return {
    kind: 'spotify',
    originalUrl: url,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    meta: { type, id },
  };
}

function parseMaps(url: string): ParsedUrl {
  return {
    kind: 'maps',
    originalUrl: url,
    meta: { raw: url },
  };
}

function parseTwitter(url: string): ParsedUrl {
  const match = url.match(TWITTER_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  return {
    kind: 'twitter',
    originalUrl: url,
    meta: { user: match[1], tweetId: match[2] },
  };
}

function parseFacebook(url: string): ParsedUrl {
  // Détection du type basée sur le path. Le resolver (côté embed) tranche
  // définitivement après suivi du redirect pour les URLs share/* opaques.
  const meta: Record<string, string> = { raw: url };
  let type = 'post';
  if (/\/share\/v\//i.test(url) || /\/videos?\//i.test(url) || /\/watch\/?\?v=/i.test(url)) {
    type = 'video';
  } else if (/\/share\/r\//i.test(url) || /\/reel\//i.test(url)) {
    type = 'reel';
  } else if (/\/photos?\//i.test(url) || /photo\.php/i.test(url)) {
    type = 'photo';
  } else if (/\/share\/p\//i.test(url) || /\/posts\//i.test(url)) {
    type = 'post';
  } else if (/\/share\//i.test(url) || /fb\.watch\//i.test(url)) {
    // share/<token> ou fb.watch/<token> : type indéterminé, le resolver tranchera.
    type = 'post';
  }
  meta.type = type;
  return {
    kind: 'facebook',
    originalUrl: url,
    meta,
  };
}

function parseInstagram(url: string): ParsedUrl {
  const match = url.match(INSTAGRAM_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const rawType = match[1].toLowerCase();
  const shortcode = match[2];
  // Normalise reels → reel pour l'URL embed.
  const type = rawType === 'reels' ? 'reel' : rawType;
  return {
    kind: 'instagram',
    originalUrl: url,
    meta: { type, shortcode },
  };
}

function parseSoundcloud(url: string): ParsedUrl {
  const match = url.match(SOUNDCLOUD_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const artist = match[1];
  const isPlaylist = !!match[2];
  const slug = match[3];
  const type = isPlaylist ? 'playlist' : 'track';
  // SoundCloud widget consomme l'URL publique directement.
  // On normalise le host à soundcloud.com (m./on. → canonique).
  const canonicalUrl = isPlaylist
    ? `https://soundcloud.com/${artist}/sets/${slug}`
    : `https://soundcloud.com/${artist}/${slug}`;
  return {
    kind: 'soundcloud',
    originalUrl: url,
    meta: { type, canonicalUrl, artist, slug },
  };
}

function parseVimeo(url: string): ParsedUrl {
  const match = url.match(VIMEO_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const videoId = match[1];
  return {
    kind: 'vimeo',
    originalUrl: url,
    embedUrl: `https://player.vimeo.com/video/${videoId}`,
    meta: { videoId },
  };
}

function parseReddit(url: string): ParsedUrl {
  const match = url.match(REDDIT_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const sub = match[1];
  const postId = match[2];
  const slug = match[3] || '';
  return {
    kind: 'reddit',
    originalUrl: url,
    meta: { sub, postId, slug },
  };
}

function parseTwitch(url: string, kind: 'clip' | 'video' | 'channel', match: RegExpMatchArray): ParsedUrl {
  const meta: Record<string, string> = { twitchKind: kind };
  if (kind === 'clip') {
    // match[1] = clips.twitch.tv/<slug>, match[2] = twitch.tv/<user>/clip/<slug>
    meta.clipSlug = match[1] || match[2] || '';
  } else if (kind === 'video') {
    meta.videoId = match[1] || '';
  } else {
    meta.channel = match[1] || '';
  }
  return {
    kind: 'twitch',
    originalUrl: url,
    meta,
  };
}

function parseDailymotion(url: string): ParsedUrl {
  const match = url.match(DAILYMOTION_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const videoId = match[1] || match[2] || '';
  return {
    kind: 'dailymotion',
    originalUrl: url,
    embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`,
    meta: { videoId },
  };
}

function parseLinkedin(url: string): ParsedUrl {
  // Tente d'extraire un URN du slug `posts/<slug>` ou `feed/update/urn:...`.
  // Pattern reconnu : ...activity-<id>... ou ...share-<id>... ou directement urn:li:share:<id>.
  const meta: Record<string, string> = { rawUrl: url };
  const urnShare = url.match(/urn(?::|%3A)li(?::|%3A)share(?::|%3A)([0-9]+)/i);
  const urnActivity = url.match(/urn(?::|%3A)li(?::|%3A)activity(?::|%3A)([0-9]+)/i);
  const activityIdInSlug = url.match(/activity-([0-9]+)/i);
  const shareIdInSlug = url.match(/share-([0-9]+)/i);
  if (urnShare) {
    meta.urn = `urn:li:share:${urnShare[1]}`;
  } else if (urnActivity) {
    meta.urn = `urn:li:activity:${urnActivity[1]}`;
  } else if (activityIdInSlug) {
    meta.urn = `urn:li:activity:${activityIdInSlug[1]}`;
  } else if (shareIdInSlug) {
    meta.urn = `urn:li:share:${shareIdInSlug[1]}`;
  }
  return {
    kind: 'linkedin',
    originalUrl: url,
    meta,
  };
}

function parsePinterest(url: string): ParsedUrl {
  const match = url.match(PINTEREST_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const pinId = match[1];
  return {
    kind: 'pinterest',
    originalUrl: url,
    meta: { pinId },
  };
}

function parseLoom(url: string): ParsedUrl {
  const match = url.match(LOOM_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const videoId = match[1];
  return {
    kind: 'loom',
    originalUrl: url,
    embedUrl: `https://www.loom.com/embed/${videoId}`,
    meta: { videoId },
  };
}

function parseAppleMusic(url: string): ParsedUrl {
  const match = url.match(APPLE_MUSIC_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const country = match[1];
  const type = match[2];
  const id = match[3];
  const trackId = match[4] || '';
  return {
    kind: 'applemusic',
    originalUrl: url,
    meta: { country, type, id, ...(trackId ? { trackId } : {}) },
  };
}

function parseDeezer(url: string): ParsedUrl {
  const match = url.match(DEEZER_REGEX);
  if (!match) {
    return { kind: 'unknown', originalUrl: url };
  }
  const type = match[1];
  const id = match[2];
  return {
    kind: 'deezer',
    originalUrl: url,
    meta: { type, id },
  };
}

function parsePdf(url: string): ParsedUrl {
  return {
    kind: 'pdf',
    originalUrl: url,
  };
}

function parseImage(url: string): ParsedUrl {
  return {
    kind: 'image',
    originalUrl: url,
  };
}

function parseArticle(url: string): ParsedUrl {
  return {
    kind: 'article',
    originalUrl: url,
  };
}

export function parseUrl(url: string): ParsedUrl {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { kind: 'unknown', originalUrl: url };
  }

  const normalizedUrl = parsedUrl.href;

  if (YOUTUBE_REGEX.test(normalizedUrl)) {
    return parseYoutube(normalizedUrl);
  }
  if (TIKTOK_REGEX.test(normalizedUrl)) {
    return parseTiktok(normalizedUrl);
  }
  if (SPOTIFY_REGEX.test(normalizedUrl)) {
    return parseSpotify(normalizedUrl);
  }
  if (MAPS_REGEX.test(normalizedUrl)) {
    return parseMaps(normalizedUrl);
  }
  if (TWITTER_REGEX.test(normalizedUrl)) {
    return parseTwitter(normalizedUrl);
  }
  if (FACEBOOK_REGEX.test(normalizedUrl)) {
    return parseFacebook(normalizedUrl);
  }
  if (INSTAGRAM_REGEX.test(normalizedUrl)) {
    return parseInstagram(normalizedUrl);
  }
  if (SOUNDCLOUD_REGEX.test(normalizedUrl)) {
    return parseSoundcloud(normalizedUrl);
  }
  if (VIMEO_REGEX.test(normalizedUrl)) {
    return parseVimeo(normalizedUrl);
  }
  if (REDDIT_REGEX.test(normalizedUrl)) {
    return parseReddit(normalizedUrl);
  }
  // Twitch : checker SPECIFIC (clip, video) AVANT GENERIC (channel)
  // sinon `twitch.tv/<name>` matche n'importe quel slug.
  const twitchClipMatch = normalizedUrl.match(TWITCH_CLIP_REGEX);
  if (twitchClipMatch) {
    return parseTwitch(normalizedUrl, 'clip', twitchClipMatch);
  }
  const twitchVideoMatch = normalizedUrl.match(TWITCH_VIDEO_REGEX);
  if (twitchVideoMatch) {
    return parseTwitch(normalizedUrl, 'video', twitchVideoMatch);
  }
  const twitchChannelMatch = normalizedUrl.match(TWITCH_CHANNEL_REGEX);
  if (twitchChannelMatch) {
    return parseTwitch(normalizedUrl, 'channel', twitchChannelMatch);
  }
  if (DAILYMOTION_REGEX.test(normalizedUrl)) {
    return parseDailymotion(normalizedUrl);
  }
  if (LINKEDIN_REGEX.test(normalizedUrl)) {
    return parseLinkedin(normalizedUrl);
  }
  if (PINTEREST_REGEX.test(normalizedUrl)) {
    return parsePinterest(normalizedUrl);
  }
  if (LOOM_REGEX.test(normalizedUrl)) {
    return parseLoom(normalizedUrl);
  }
  if (APPLE_MUSIC_REGEX.test(normalizedUrl)) {
    return parseAppleMusic(normalizedUrl);
  }
  if (DEEZER_REGEX.test(normalizedUrl)) {
    return parseDeezer(normalizedUrl);
  }
  if (PDF_REGEX.test(normalizedUrl)) {
    return parsePdf(normalizedUrl);
  }
  if (IMAGE_REGEX.test(normalizedUrl)) {
    return parseImage(normalizedUrl);
  }

  return parseArticle(normalizedUrl);
}

export function extractUrls(text: string): string[] {
  const urlRegex = /\bhttps?:\/\/[^\s<>"']+/gi;
  const matches = text.match(urlRegex);
  if (!matches) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawUrl of matches) {
    let cleaned = rawUrl.replace(/[).,;:!?]+$/, '');
    // Remove trailing punctuation that might be part of sentence
    while (cleaned.length > 0 && /[).,;:!?]/.test(cleaned[cleaned.length - 1])) {
      cleaned = cleaned.slice(0, -1);
    }
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }

  return result;
}
