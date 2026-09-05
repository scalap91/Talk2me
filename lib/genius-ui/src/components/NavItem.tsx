import type { GeniusNavItemProps } from '../generated/types';
import { ICONS } from '../icons';

/** GeniusNavItem — onglet de navigation. Rendu <button aria-current>. Se colore selon `active`. */
export function GeniusNavItem({ icon, label, active = false, onPress }: GeniusNavItemProps) {
  const d = ICONS[icon];
  return (
    <button type="button" className="gu-navitem" data-active={active} aria-current={active ? 'page' : undefined} onClick={() => onPress?.()}>
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
        {d ? <path d={d} fill="currentColor" /> : <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />}
      </svg>
      <span className="gu-navitem-label">{label}</span>
    </button>
  );
}
