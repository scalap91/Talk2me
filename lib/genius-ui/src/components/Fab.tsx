import type { GeniusFabProps } from '../generated/types';
import { GeniusIcon } from './Icon';

/** GeniusFab — bouton d'action flottant. Rendu <button aria-label> rond surélevé (layer 'raised'). */
export function GeniusFab({ icon, label, size = 'md', disabled = false, onPress }: GeniusFabProps) {
  return (
    <button type="button" className="gu-fab" data-size={size} aria-label={label} disabled={disabled} onClick={() => { if (!disabled) onPress?.(); }}>
      <GeniusIcon name={icon} size={size === 'lg' ? 'lg' : 'md'} color="onPrimary" />
    </button>
  );
}
