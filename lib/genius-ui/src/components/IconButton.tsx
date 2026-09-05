import type { GeniusIconButtonProps } from '../generated/types';
import { GeniusIcon } from './Icon';

/** GeniusIconButton — bouton-icône. Rendu <button aria-label> (focus clavier, Entrée/Espace). */
export function GeniusIconButton({ icon, label, variant = 'plain', size = 'md', disabled = false, onPress }: GeniusIconButtonProps) {
  return (
    <button type="button" className="gu-iconbtn" data-variant={variant} data-size={size} aria-label={label} disabled={disabled} onClick={() => { if (!disabled) onPress?.(); }}>
      <GeniusIcon name={icon} size={size} color={variant === 'filled' ? 'onPrimary' : 'ink'} />
    </button>
  );
}
