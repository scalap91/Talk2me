import type { GeniusExpandedProps } from '../generated/types';

/** GeniusExpanded — enfant flexible d'une Row/Column. Rendu <div> flex item. */
export function GeniusExpanded({ flex = 1, fit = 'tight', children }: GeniusExpandedProps) {
  return <div style={{ flexGrow: flex, flexShrink: 1, flexBasis: fit === 'tight' ? 0 : 'auto', minWidth: 0, minHeight: 0 }}>{children}</div>;
}
