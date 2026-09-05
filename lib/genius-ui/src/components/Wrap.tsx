import type { GeniusWrapProps } from '../generated/types';
import { sp } from '../internal';

/** GeniusWrap — flux d'éléments qui passe à la ligne. Rendu <div> flex-wrap. */
export function GeniusWrap({ gap = 'sm', runGap = 'sm', align = 'start', children }: GeniusWrapProps) {
  const justify = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center';
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${sp(runGap)} ${sp(gap)}`, justifyContent: justify }}>{children}</div>;
}
