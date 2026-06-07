/**
 * /home/ubuntu/talktome/lib/video-filters.ts
 *
 * Talk2Me #421 — bibliothèque de filtres couleur/style pour VideoCard.
 *
 * Deux représentations par preset :
 *  - `css`  : CSS `filter:` appliqué au <video> pour la preview LIVE
 *             (instantané, pas de re-encode). Cf VideoFiltersTab + preview.
 *  - `ffmpeg` : chaîne -vf utilisée au baking final (concat + render) pour
 *               burn-in dans le fichier mp4.
 *
 * Doctrine [[talktome-design-premium]] : on garde des presets sobres et
 * crédibles (cinéma, vintage, nuit…) plutôt que des LUTs criards. Le but
 * = donner un look pro, pas un filtre Snapchat.
 */
'use client';

export type FilterPreset =
  | 'none'
  | 'bw'
  | 'sepia'
  | 'vintage'
  | 'cold'
  | 'warm'
  | 'dramatic'
  | 'vivid'
  | 'faded'
  | 'lomo'
  | 'cinema'
  | 'night';

export interface FilterDef {
  /** Clé interne stable. */
  key: FilterPreset;
  /** Label affiché dans l'UI. */
  label: string;
  /** Emoji utilisé comme micro-icône (UI seulement). */
  emoji: string;
  /** Filtre CSS pour la preview HTML5 (instantané). */
  css: string;
  /** Chaîne ffmpeg -vf pour le baking final (vide pour 'none'). */
  ffmpeg: string;
}

export const FILTER_PRESETS: Record<FilterPreset, FilterDef> = {
  none: {
    key: 'none',
    label: 'Original',
    emoji: '•',
    css: '',
    ffmpeg: '',
  },
  bw: {
    key: 'bw',
    label: 'N&B',
    emoji: '◐',
    css: 'grayscale(1) contrast(1.05)',
    ffmpeg: 'hue=s=0,eq=contrast=1.05',
  },
  sepia: {
    key: 'sepia',
    label: 'Sépia',
    emoji: '☕',
    css: 'sepia(1) contrast(1.05)',
    // matrice sepia "standard"
    ffmpeg:
      'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0',
  },
  vintage: {
    key: 'vintage',
    label: 'Vintage',
    emoji: '📼',
    css: 'sepia(0.45) contrast(1.1) brightness(1.05) saturate(0.9)',
    ffmpeg:
      'curves=preset=increase_contrast,eq=saturation=0.9:brightness=0.04,colorchannelmixer=.9:.05:.05:0:.05:.9:.05:0:.05:.05:.9:0',
  },
  cold: {
    key: 'cold',
    label: 'Froid',
    emoji: '❄️',
    css: 'hue-rotate(170deg) saturate(0.85) brightness(0.98)',
    ffmpeg: 'curves=preset=cool,eq=saturation=0.85',
  },
  warm: {
    key: 'warm',
    label: 'Chaud',
    emoji: '🌅',
    css: 'sepia(0.2) saturate(1.2) hue-rotate(-10deg) brightness(1.03)',
    ffmpeg: 'curves=preset=warmer,eq=saturation=1.15',
  },
  dramatic: {
    key: 'dramatic',
    label: 'Dramatique',
    emoji: '🎭',
    css: 'contrast(1.35) brightness(0.95) saturate(1.1)',
    ffmpeg: 'eq=contrast=1.35:brightness=-0.05:saturation=1.1',
  },
  vivid: {
    key: 'vivid',
    label: 'Vivid',
    emoji: '✨',
    css: 'saturate(1.5) contrast(1.1)',
    ffmpeg: 'eq=saturation=1.5:contrast=1.1',
  },
  faded: {
    key: 'faded',
    label: 'Faded',
    emoji: '🌫️',
    css: 'saturate(0.6) brightness(1.08) contrast(0.92)',
    ffmpeg: 'eq=saturation=0.6:brightness=0.08:contrast=0.92',
  },
  lomo: {
    key: 'lomo',
    label: 'Lomo',
    emoji: '📸',
    css: 'saturate(1.4) contrast(1.2)',
    ffmpeg: 'eq=saturation=1.4:contrast=1.2,vignette=PI/5',
  },
  cinema: {
    key: 'cinema',
    label: 'Cinéma',
    emoji: '🎬',
    css: 'contrast(1.2) saturate(0.85) brightness(0.97)',
    ffmpeg: 'eq=contrast=1.2:saturation=0.85:brightness=-0.03',
  },
  night: {
    key: 'night',
    label: 'Nuit',
    emoji: '🌙',
    css: 'brightness(0.78) saturate(0.55) hue-rotate(180deg) contrast(1.1)',
    ffmpeg: 'eq=brightness=-0.22:saturation=0.55:contrast=1.1,hue=h=180',
  },
};

/** Ordre stable d'affichage dans l'UI. */
export const FILTER_ORDER: FilterPreset[] = [
  'none',
  'bw',
  'sepia',
  'vintage',
  'cold',
  'warm',
  'dramatic',
  'vivid',
  'faded',
  'lomo',
  'cinema',
  'night',
];

export function getFilter(key: FilterPreset | string | null | undefined): FilterDef {
  if (!key) return FILTER_PRESETS.none;
  const k = key as FilterPreset;
  return FILTER_PRESETS[k] ?? FILTER_PRESETS.none;
}

/** Retourne la chaîne CSS prête à mettre dans `filter:` (vide si none). */
export function filterCss(key: FilterPreset | string | null | undefined): string {
  return getFilter(key).css || '';
}

/** Retourne la chaîne ffmpeg -vf (vide si none). */
export function filterFfmpeg(
  key: FilterPreset | string | null | undefined
): string {
  return getFilter(key).ffmpeg || '';
}
