import type { GeniusIconProps } from '../generated/types';
import { col } from '../internal';
import { ICONS } from '../icons';

const SIZE = { sm: 16, md: 20, lg: 24 } as const;

/** GeniusIcon — icône du registre partagé. Rendu <svg fill=currentColor>. */
export function GeniusIcon({ name, size = 'md', color = 'ink' }: GeniusIconProps) {
  const d = ICONS[name];
  const s = SIZE[size];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ color: col(color), display: 'inline-block', flex: 'none' }} aria-hidden="true">
      {d ? <path d={d} fill="currentColor" /> : <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}
