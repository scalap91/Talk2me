import type { GeniusScrollProps } from '../generated/types';

/** GeniusScroll — conteneur défilant. Rendu <div overflow:auto>. Normalise SingleChildScrollView. */
export function GeniusScroll({ axis = 'vertical', children }: GeniusScrollProps) {
  const horizontal = axis === 'horizontal';
  return (
    <div style={{ overflowX: horizontal ? 'auto' : 'hidden', overflowY: horizontal ? 'hidden' : 'auto', display: horizontal ? 'flex' : 'block', minHeight: 0, minWidth: 0 }}>
      {children}
    </div>
  );
}
