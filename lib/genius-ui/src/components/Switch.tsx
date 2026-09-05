import type { GeniusSwitchProps } from '../generated/types';

/**
 * GeniusSwitch — bascule binaire. Rendu <button role="switch"> natif : focusable, bascule à
 * Espace/Entrée (comportement natif du bouton), aria-checked, anneau de focus visible.
 * Brique interactive de référence : état contrôlé + onChange + disabled + accessibilité.
 */
export function GeniusSwitch({ value = false, disabled = false, onChange }: GeniusSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className="gu-switch"
      data-on={value}
      onClick={() => { if (!disabled) onChange?.(!value); }}
    >
      <span className="gu-switch-thumb" />
    </button>
  );
}
