import type { CSSProperties } from 'react';
import type { GeniusRowProps } from '../generated/types';
import { sp, flexAlign, flexJustify } from '../internal';

/**
 * GeniusRow — aligne horizontalement. Rendu <div> flex.
 * Responsive Web : `stackBelow` fait passer la ligne en colonne sous un palier (mobile-first),
 * via la CSS responsive générée (pas de media query inline). Flutter ignore cette capacité.
 */
export function GeniusRow({ gap = 'none', align = 'center', justify = 'start', stackBelow, children }: GeniusRowProps) {
  const responsive = !!stackBelow;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: responsive ? undefined : 'row', // en mode responsive, la direction est pilotée par la CSS
    gap: sp(gap),
    alignItems: responsive ? undefined : flexAlign(align),
    justifyContent: flexJustify(justify),
  };
  if (responsive) (style as Record<string, string>)['--gu-row-align'] = flexAlign(align);
  return <div className="gu-row" data-stackbelow={stackBelow} style={style}>{children}</div>;
}
