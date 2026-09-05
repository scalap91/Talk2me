import type { GeniusSpinnerProps } from '../generated/types';
import { col } from '../internal';

const D = { sm: { d: 16, b: 2 }, md: { d: 24, b: 3 }, lg: { d: 36, b: 4 } } as const;

/** GeniusSpinner — anneau de chargement. Rendu <span role=status> animé en CSS. */
export function GeniusSpinner({ size = 'md', color = 'primary' }: GeniusSpinnerProps) {
  const { d, b } = D[size];
  return <span className="gu-spinner" role="status" aria-label="Chargement" style={{ width: d, height: d, borderWidth: b, color: col(color) }} />;
}
