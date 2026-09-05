import type { GeniusColumnProps } from '../generated/types';
import { sp, flexAlign, flexJustify } from '../internal';

/** GeniusColumn — empile verticalement. Rendu <div> flex. */
export function GeniusColumn({ gap = 'none', align = 'stretch', justify = 'start', children }: GeniusColumnProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp(gap), alignItems: flexAlign(align), justifyContent: flexJustify(justify) }}>
      {children}
    </div>
  );
}
