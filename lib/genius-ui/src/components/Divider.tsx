import type { GeniusDividerProps } from '../generated/types';
import { col } from '../internal';

/** GeniusDivider — séparateur. Horizontal = <hr> sémantique ; vertical = <div role=separator>. */
export function GeniusDivider({ vertical = false, color = 'line' }: GeniusDividerProps) {
  return vertical
    ? <div role="separator" aria-orientation="vertical" style={{ width: 1, alignSelf: 'stretch', background: col(color) }} />
    : <hr style={{ border: 0, height: 1, width: '100%', margin: 0, background: col(color) }} />;
}
