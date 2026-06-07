import type { Extractor } from './types';
import { youtubeExtractor } from './extractors/youtube';
import { tiktokExtractor } from './extractors/tiktok';
import { spotifyExtractor } from './extractors/spotify';
import { soundcloudExtractor } from './extractors/soundcloud';
import { appleMusicExtractor } from './extractors/apple-music';
import { deezerExtractor } from './extractors/deezer';
import { vimeoExtractor } from './extractors/vimeo';
import { dailymotionExtractor } from './extractors/dailymotion';
import { twitchExtractor } from './extractors/twitch';
import { loomExtractor } from './extractors/loom';
import { twitterExtractor } from './extractors/twitter';
import { facebookExtractor } from './extractors/facebook';
import { instagramExtractor } from './extractors/instagram';
import { linkedinExtractor } from './extractors/linkedin';
import { pinterestExtractor } from './extractors/pinterest';
import { redditExtractor } from './extractors/reddit';
import { mapsExtractor } from './extractors/maps';
import { imageExtractor } from './extractors/image';
import { articleExtractor } from './extractors/article';

/**
 * Universal Embed Hub — registry des extracteurs.
 *
 * Ordre = priorité de matching (plus spécifique → plus générique).
 * Le fallback `articleExtractor` est retourné par `detectExtractor` quand
 * aucun extracteur spécifique ne matche (pas listé dans EXTRACTORS pour
 * rester explicite).
 *
 * 17 plateformes (Phase 1-2-3 — Pascal 2026-06-05) :
 *  Vidéo  : youtube, tiktok, vimeo, dailymotion, twitch, loom
 *  Audio  : spotify, soundcloud, apple-music, deezer
 *  Social : twitter (X), facebook, instagram, linkedin, pinterest, reddit
 *  Place  : maps (Google Maps + maps.app.goo.gl)
 *  Article (catch-all) : via fallback detectExtractor.
 */

export const EXTRACTORS: Array<{
  name: string;
  match: RegExp;
  extractor: Extractor;
}> = [
  // ─── Vidéo ───────────────────────────────────────────────────────────────
  {
    name: 'youtube',
    match: /(?:youtube\.com|youtu\.be)/i,
    extractor: youtubeExtractor,
  },
  {
    name: 'tiktok',
    match: /tiktok\.com|vm\.tiktok\.com/i,
    extractor: tiktokExtractor,
  },
  // ─── Audio ───────────────────────────────────────────────────────────────
  {
    name: 'spotify',
    match: /open\.spotify\.com/i,
    extractor: spotifyExtractor,
  },
  {
    name: 'soundcloud',
    match: /\bsoundcloud\.com/i,
    extractor: soundcloudExtractor,
  },
  {
    name: 'apple-music',
    match: /music\.apple\.com/i,
    extractor: appleMusicExtractor,
  },
  {
    name: 'deezer',
    match: /\bdeezer\.com/i,
    extractor: deezerExtractor,
  },
  // ─── Vidéo bis (après spotify pour éviter false-positive) ────────────────
  {
    name: 'vimeo',
    match: /vimeo\.com/i,
    extractor: vimeoExtractor,
  },
  {
    name: 'dailymotion',
    match: /dailymotion\.com|dai\.ly/i,
    extractor: dailymotionExtractor,
  },
  {
    name: 'twitch',
    match: /twitch\.tv|clips\.twitch\.tv/i,
    extractor: twitchExtractor,
  },
  {
    name: 'loom',
    match: /loom\.com/i,
    extractor: loomExtractor,
  },
  // ─── Social ──────────────────────────────────────────────────────────────
  {
    name: 'twitter',
    match: /(?:twitter\.com|x\.com)\/[^/]+\/status\/\d+/i,
    extractor: twitterExtractor,
  },
  {
    name: 'facebook',
    match: /\bfacebook\.com|fb\.watch/i,
    extractor: facebookExtractor,
  },
  {
    name: 'instagram',
    match: /\binstagram\.com/i,
    extractor: instagramExtractor,
  },
  {
    name: 'linkedin',
    match: /\blinkedin\.com/i,
    extractor: linkedinExtractor,
  },
  {
    name: 'pinterest',
    match: /pinterest\.[a-z.]+/i,
    extractor: pinterestExtractor,
  },
  {
    name: 'reddit',
    match: /\breddit\.com/i,
    extractor: redditExtractor,
  },
  // ─── Place ───────────────────────────────────────────────────────────────
  {
    name: 'maps',
    match: /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i,
    extractor: mapsExtractor,
  },
  // ─── Media direct ────────────────────────────────────────────────────────
  // Image directe (CDN, .jpg/.png/.webp/...) — bug #5 audit #413.
  // En queue car les autres extracteurs ont des hostnames spécifiques ;
  // image matche aussi par extension donc filet de sécurité.
  {
    name: 'image',
    match:
      /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)|images\.unsplash\.com|i\.imgur\.com|cdn\.discordapp\.com|media\.giphy\.com|media[0-9]?\.tenor\.com/i,
    extractor: imageExtractor,
  },
  // Article = catch-all géré par detectExtractor() ci-dessous.
];

export function detectExtractor(url: string): Extractor | null {
  for (const e of EXTRACTORS) {
    if (e.match.test(url)) return e.extractor;
  }
  return articleExtractor; // toujours retourner article comme fallback
}
