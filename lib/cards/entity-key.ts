/**
 * core/card-engine — CLÉ D'ENTITÉ (dédup de la « page-entité vivante », Pascal 2026-07-08).
 *
 * Un contenu RÉFÉRENÇABLE (son YouTube, produit, lieu, lien) → clé STABLE :
 *   deux partages du MÊME contenu = MÊME clé = MÊME card canonique.
 *   → le 2e qui partage devient CONTRIBUTEUR de la card au lieu de créer un doublon.
 * Un contenu PERSO/ORIGINAL (ta propre photo, ton propre texte) → null :
 *   pas de dédup, la card est unique (elle n'est « la même » que pour personne).
 *
 * Sert le SEO (1 page profonde par entité au lieu de 1000 pages minces) et le
 * cercle vertueux d'enrichissement. Voir mémoire [[project_talk2me_page_entite_vivante]].
 */
import type { SuperCard } from './supercard';

/** Extrait l'ID vidéo YouTube (11 car.) d'une URL ou d'un embed, sinon null. */
export function youtubeId(u?: string): string | null {
  if (!u) return null;
  const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(u.trim()) ? u.trim() : null;
}

/** slug ASCII stable (minuscules, sans accents, tirets), tronqué. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Normalise une URL en clé stable : host + path, sans www / query / tracking / slash final. */
function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `url:${host}${path}`;
  } catch {
    return null;
  }
}

/**
 * Clé d'entité canonique d'une card, ou null si contenu perso/original (pas de dédup).
 * Ordre de priorité (du plus fiable au plus flou) : vidéo/audio → produit → code → lien → lieu.
 */
export function computeEntityKey(card: Partial<SuperCard>): string | null {
  // 1) Son/vidéo YouTube — le cas « son partagé » (le plus fréquent).
  const yt = youtubeId(card.video?.url) || youtubeId(card.video?.embed) || youtubeId(card.audio?.embed);
  if (yt) return `yt:${yt}`;

  // 2) Produit d'un fournisseur (dropship/API) : provider + référence.
  if (card.api?.provider && card.api?.ref) {
    return `prod:${slug(card.api.provider)}:${slug(card.api.ref)}`;
  }

  // 3) Code produit explicite (GTIN/EAN/SKU) dans les specs universelles.
  const code = card.specs?.gtin || card.specs?.ean || card.specs?.sku;
  if (code) return `gtin:${slug(String(code))}`;

  // 4) Lien générique (article, page web).
  if (card.link?.url) {
    const k = normalizeUrl(card.link.url);
    if (k) return k;
  }

  // 5) Lieu géolocalisé (resto/place) : coordonnées arrondies (~11 m).
  if (typeof card.place?.lat === 'number' && typeof card.place?.lng === 'number') {
    return `geo:${card.place.lat.toFixed(4)},${card.place.lng.toFixed(4)}`;
  }

  // Sinon : contenu perso/original → pas de clé, pas de dédup.
  return null;
}

/**
 * Référence d'ENTITÉ universelle pour clé contributeurs/enrichissements :
 * - contenu référençable → sa `entity_key` (2 partages du même son = MÊME ref) ;
 * - contenu perso/original → `card:<id>` (unique, l'entité EST la card, 1:1).
 * C'est CETTE clé qui unifie : la page /card d'un partage résout la même ref que
 * la page d'un autre partage du même contenu → mêmes contributeurs.
 */
export function entityRef(card: Partial<SuperCard> & { id?: string }): string {
  const key = computeEntityKey(card);
  return key || `card:${card.id || 'unknown'}`;
}
