import type { GeniusButtonProps } from '../generated/types';

/** GeniusButton — action. Rendu <button> natif (focus clavier, Entrée/Espace, type=button). */
export function GeniusButton({ variant = 'primary', size = 'md', disabled = false, loading = false, fullWidth = false, label, onPress, children }: GeniusButtonProps) {
  const blocked = disabled || loading;
  return (
    <button
      type="button"
      className="gu-btn"
      data-variant={variant}
      data-size={size}
      data-fullwidth={fullWidth}
      disabled={blocked}
      aria-busy={loading || undefined}
      onClick={() => { if (!blocked) onPress?.(); }}
    >
      {loading ? '…' : (children ?? label)}
    </button>
  );
}
