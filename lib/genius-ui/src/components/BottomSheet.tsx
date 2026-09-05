import type { GeniusBottomSheetProps } from '../generated/types';
import { OverlayShell } from './overlayShell';

/** GeniusBottomSheet — feuille modale basse. Rendu <dialog> natif stylé (top-layer/Échap/backdrop gratuits). */
export function GeniusBottomSheet({ open = false, title, dismissible = true, children, onClose }: GeniusBottomSheetProps) {
  return <OverlayShell className="gu-bottomsheet" open={open} title={title} dismissible={dismissible} onClose={onClose}>{children}</OverlayShell>;
}
