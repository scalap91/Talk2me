import type { GeniusDialogProps } from '../generated/types';
import { OverlayShell } from './overlayShell';

/** GeniusDialog — dialogue modal centré. Rendu <dialog> natif (focus trap/Échap/top-layer gratuits). */
export function GeniusDialog({ open = false, title, dismissible = true, children, onClose }: GeniusDialogProps) {
  return <OverlayShell className="gu-dialog" open={open} title={title} dismissible={dismissible} onClose={onClose}>{children}</OverlayShell>;
}
