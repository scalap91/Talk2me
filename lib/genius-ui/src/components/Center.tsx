import type { GeniusCenterProps } from '../generated/types';
import { stackPlace } from '../internal';

/** GeniusCenter — aligne un enfant selon une ancre. Rendu <div> grid. Normalise Center/Align. */
export function GeniusCenter({ align = 'center', children }: GeniusCenterProps) {
  return <div style={{ display: 'grid', placeItems: stackPlace(align) }}>{children}</div>;
}
