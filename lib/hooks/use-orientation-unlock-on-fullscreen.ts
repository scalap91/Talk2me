'use client';

import { useEffect } from 'react';

/**
 * Talk2Me (Pascal 2026-06-04) — Rotation paysage UNIQUEMENT en fullscreen vidéo.
 *
 * Doctrine : portrait par défaut PARTOUT (l'app est lockée portrait via
 * `<PortraitLock />` monté dans le root layout). Quand une vidéo entre en
 * plein écran (YouTube iframe, <video> HTML5, etc.), on déverrouille
 * l'orientation pour autoriser le mode paysage natif. À la sortie du
 * fullscreen, on re-locke en portrait.
 *
 * Compat :
 *  - `fullscreenchange` (standard)
 *  - `webkitfullscreenchange` (Safari iOS / vieux WebKit)
 *  - try/catch silencieux : iOS Safari et desktop peuvent ne pas exposer
 *    `screen.orientation.lock/unlock` (la promesse rejette ou la méthode
 *    n'existe pas). On ne casse jamais le rendu.
 */
export function useOrientationUnlockOnFullscreen() {
  useEffect(() => {
    const handleFullscreen = () => {
      const fs =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element })
          .webkitFullscreenElement;

      // Talk2Me #404 (Pascal 2026-06-05) — pose .allow-landscape sur <html>
      // pour DÉSACTIVER le CSS-rotate hack global pendant un fullscreen
      // vidéo. Sinon le rotate -90deg du body s'appliquerait à l'iframe
      // YouTube/TikTok en lecture paysage et le rendu serait cassé.
      try {
        if (fs) {
          document.documentElement.classList.add('allow-landscape');
        } else {
          document.documentElement.classList.remove('allow-landscape');
        }
      } catch {
        /* silencieux */
      }

      const orient = (typeof screen !== 'undefined' ? screen.orientation : undefined) as
        | (ScreenOrientation & {
            unlock?: () => void;
            lock?: (o: string) => Promise<void>;
          })
        | undefined;
      if (!orient) return;
      try {
        if (fs) {
          if (typeof orient.unlock === 'function') {
            orient.unlock();
          }
        } else if (typeof orient.lock === 'function') {
          orient.lock('portrait').catch(() => {
            /* device / browser refuse : on ignore */
          });
        }
      } catch {
        /* silencieux */
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleFullscreen);
    };
  }, []);
}
