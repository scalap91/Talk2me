import type { CSSProperties } from 'react';
import type { GeniusSnackbarProps } from '../generated/types';

/**
 * GeniusSnackbar — message transitoire. Rendu <div role=status> en position fixe au niveau de layer
 * 'toast' (ADR-0009). Contrôlé par `open` ; rend null si fermé (pas d'overlay fantôme).
 */
export function GeniusSnackbar({ message, open = false, variant = 'info', actionLabel, onAction, onDismiss }: GeniusSnackbarProps) {
  if (!open) return null;
  const style: CSSProperties = { zIndex: 'var(--gu-layer-toast)' as unknown as number };
  return (
    <div role="status" aria-live="polite" className="gu-snackbar" data-variant={variant} style={style}>
      <span style={{ flex: 1 }}>{message}</span>
      {actionLabel && <button type="button" className="gu-snackbar-action" onClick={() => onAction?.()}>{actionLabel}</button>}
      <button type="button" aria-label="Fermer" className="gu-snackbar-close" onClick={() => onDismiss?.()}>✕</button>
    </div>
  );
}
