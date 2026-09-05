import { createElement } from 'react';
import type { GeniusTextProps } from '../generated/types';
import { col } from '../internal';

// Chaque variant porte une balise sémantique (hiérarchie SEO / lecteurs d'écran).
const TAG: Record<NonNullable<GeniusTextProps['variant']>, string> = {
  display: 'h1', title: 'h2', body: 'p', caption: 'span', label: 'span',
};

/** GeniusText — texte typé par l'échelle typographique. Rendu balise sémantique selon variant. */
export function GeniusText({ variant = 'body', weight, color = 'ink', align = 'start', children }: GeniusTextProps) {
  return createElement(
    TAG[variant],
    {
      className: 'gu-text',
      style: {
        fontSize: `var(--gu-type-${variant}-size)`,
        lineHeight: `var(--gu-type-${variant}-lh)`,
        // graisse : prop explicite sinon graisse de base du variant
        fontWeight: weight ? `var(--gu-weight-${weight})` : `var(--gu-type-${variant}-weight)`,
        color: col(color),
        textAlign: align,
      },
    },
    children,
  );
}
