import type { Extractor } from '../types';

/**
 * Maps extractor — Universal Embed Hub Phase 2 (Pascal 2026-06-05).
 *
 * URLs reconnues :
 *  - google.<tld>/maps/...           (place, search, directions, @lat,lng,zoom)
 *  - maps.app.goo.gl/<token>         (lien partage app Google Maps)
 *  - goo.gl/maps/<token>             (ancien shortener)
 *
 * Stratégie embed :
 *  1) Si l'URL contient des coordonnées `@lat,lng` ou `!3d<lat>!4d<lng>`, on
 *     extrait lat/lng → embed via `google.com/maps?q=<lat>,<lng>&output=embed`
 *     (URL publique sans clé, suffisante pour preview Place).
 *  2) Sinon (shortener `maps.app.goo.gl` ou recherche libre), on retourne
 *     une card sans embed (FallbackCard → bouton "Ouvrir dans Maps").
 *
 * Action `directions` ajoutée si coords disponibles.
 */

const MAPS_REGEX =
  /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*google\.[a-z.]+\/maps|^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i;

const AT_COORDS_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/;
const BANG_COORDS_RE = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;

function extractCoords(url: string): { lat: number; lng: number } | null {
  const at = url.match(AT_COORDS_RE);
  if (at) {
    const lat = Number.parseFloat(at[1]);
    const lng = Number.parseFloat(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const bang = url.match(BANG_COORDS_RE);
  if (bang) {
    const lat = Number.parseFloat(bang[1]);
    const lng = Number.parseFloat(bang[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function extractPlaceName(url: string): string {
  // /maps/place/<name>/@... ou /maps/search/<name>
  const place = url.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);
  if (place) {
    try {
      return decodeURIComponent(place[1].replace(/\+/g, ' '));
    } catch {
      return place[1];
    }
  }
  return 'Localisation';
}

export const mapsExtractor: Extractor = async (url) => {
  if (!MAPS_REGEX.test(url)) return { ok: false, reason: 'not_maps' };

  const coords = extractCoords(url);
  const placeName = extractPlaceName(url);

  if (coords) {
    const { lat, lng } = coords;
    const embedSrc = `https://www.google.com/maps?q=${lat},${lng}&hl=fr&z=16&output=embed`;
    return {
      ok: true,
      card: {
        source: 'maps',
        source_label: 'Google Maps',
        type: 'place',
        title: placeName,
        external_url: url,
        embed: {
          kind: 'iframe',
          src: embedSrc,
          aspect_ratio: '16 / 9',
          allow: 'encrypted-media',
        },
        meta: { lat, lng, place_name: placeName },
        actions: [
          { kind: 'open', label: 'Ouvrir dans Maps', url },
          {
            kind: 'directions',
            label: 'Itinéraire',
            lat,
            lng,
          },
          { kind: 'share', label: 'Partager' },
        ],
      },
    };
  }

  // Pas de coords extractibles → card sans embed (FallbackCard).
  return {
    ok: true,
    card: {
      source: 'maps',
      source_label: 'Google Maps',
      type: 'place',
      title: placeName,
      external_url: url,
      meta: { no_coords: true },
      actions: [
        { kind: 'open', label: 'Ouvrir dans Maps', url },
        { kind: 'share', label: 'Partager' },
      ],
    },
  };
};
