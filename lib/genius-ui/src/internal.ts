// Helpers de style internes (NON exportés publiquement). Traduisent les tokens/enums de la spec
// en valeurs CSS. Aucune valeur en dur : tout passe par les variables CSS générées (tokens.css).
import type { GeniusSpacing, GeniusColor } from './generated/types';

export const sp = (t: GeniusSpacing) => `var(--gu-space-${t})`;
export const col = (r: GeniusColor) => `var(--gu-color-${r})`;

export const flexAlign = (a: 'start' | 'center' | 'end' | 'stretch') =>
  a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a; // center|stretch inchangés

export const flexJustify = (j: 'start' | 'center' | 'end' | 'between' | 'around') =>
  j === 'start' ? 'flex-start' : j === 'end' ? 'flex-end' : j === 'between' ? 'space-between' : j === 'around' ? 'space-around' : 'center';

// Ancre d'un Stack → valeur CSS place-items ("<align-items> <justify-items>").
const V = { top: 'start', bottom: 'end', center: 'center' } as const;
const H = { Start: 'start', End: 'end' } as const;
export const stackPlace = (a: string): string => {
  if (a === 'center') return 'center center';
  if (a === 'top') return 'start center';
  if (a === 'bottom') return 'end center';
  if (a === 'start') return 'center start';
  if (a === 'end') return 'center end';
  const v = a.startsWith('top') ? V.top : a.startsWith('bottom') ? V.bottom : V.center;
  const h = a.endsWith('Start') ? H.Start : a.endsWith('End') ? H.End : 'center';
  return `${v} ${h}`;
};
