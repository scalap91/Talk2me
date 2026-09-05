import type { CSSProperties } from 'react';
import type { GeniusGridProps } from '../generated/types';
import { sp } from '../internal';

/**
 * GeniusGrid — grille responsive. Rendu <div class="gu-grid">. Les colonnes par palier sont posées
 * en variables CSS (--gu-cols-*) consommées par la CSS responsive générée (aucune media query ici).
 */
export function GeniusGrid({ cols = 2, colsMd, colsLg, colsXl, gap = 'sm', children }: GeniusGridProps) {
  const style: CSSProperties = { gap: sp(gap) };
  const vars = style as Record<string, string | number>;
  vars['--gu-cols-base'] = cols;
  if (colsMd != null) vars['--gu-cols-md'] = colsMd;
  if (colsLg != null) vars['--gu-cols-lg'] = colsLg;
  if (colsXl != null) vars['--gu-cols-xl'] = colsXl;
  return <div className="gu-grid" style={style}>{children}</div>;
}
