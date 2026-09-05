import type { GeniusPressableProps } from '../generated/types';

/**
 * GeniusPressable — rend un contenu quelconque cliquable, accessible. Rendu <div role="button">
 * avec gestion clavier (Entrée/Espace), focus visible, cursor. Pas de <button> pour autoriser du
 * contenu riche/imbriqué. Normalise GestureDetector/InkWell.
 */
export function GeniusPressable({ label, disabled = false, onPress, children }: GeniusPressableProps) {
  const act = () => { if (!disabled) onPress?.(); };
  return (
    <div
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className="gu-pressable"
      onClick={act}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act(); } }}
      style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </div>
  );
}
