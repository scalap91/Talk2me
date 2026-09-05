import type { GeniusProgressProps } from '../generated/types';
import { col } from '../internal';

/** GeniusProgress — barre linéaire. Rendu <div role=progressbar>. Indéterminée si value absente. */
export function GeniusProgress({ value, color = 'primary' }: GeniusProgressProps) {
  const determinate = value != null;
  const pct = determinate ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={determinate ? Math.round(pct) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className={'gu-progress' + (determinate ? '' : ' gu-progress--indeterminate')}
    >
      <div className="gu-progress-fill" style={{ width: determinate ? `${pct}%` : undefined, background: col(color) }} />
    </div>
  );
}
