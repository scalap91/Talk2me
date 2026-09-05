import type { GeniusStackProps } from '../generated/types';
import { stackPlace } from '../internal';

/** GeniusStack — superpose les enfants (grille, cellule unique). Rendu <div> grid. */
export function GeniusStack({ align = 'topStart', children }: GeniusStackProps) {
  return (
    <div className="gu-stack" style={{ display: 'grid', placeItems: stackPlace(align) }}>
      {children}
    </div>
  );
}
