'use client';

import { useEffect } from 'react';

/**
 * Talk2Me (Pascal 2026-06-04) — Lock portrait global au boot.
 *
 * Le manifest PWA est désormais `"orientation": "any"` pour permettre le
 * déverrouillage à la demande (hook `useOrientationUnlockOnFullscreen`).
 * Conséquence : sans ce composant, le device tournerait librement partout.
 *
 * Ici on lock dès le mount du root layout. Comportement attendu :
 *  - App ouverte en PWA (S23 FE) → reste en portrait quoi qu'il arrive
 *    en dehors d'un fullscreen vidéo.
 *  - Fullscreen vidéo → unlock par le hook → device libre de tourner.
 *  - Sortie fullscreen → re-lock par le hook.
 *
 * Compat : sur desktop, iOS Safari et certains browsers Android,
 * `screen.orientation.lock` peut throw (DOMException : NotSupportedError
 * ou SecurityError hors fullscreen). On catche silencieusement : Pascal
 * a validé que les browsers qui ne supportent pas ce lock ne sont pas
 * la cible PWA mobile.
 */
export default function PortraitLock() {
  useEffect(() => {
    if (typeof screen === 'undefined' || !screen.orientation) return;
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (typeof orient.lock !== 'function') return;

    const tryLock = () => {
      try {
        orient.lock!('portrait').catch(() => {
          /* browser ou device refuse : on ignore */
        });
      } catch {
        /* silencieux */
      }
    };

    // Lock au mount initial
    tryLock();

    // Talk2Me #404 (Pascal 2026-06-05) — retry sur retour d'app (BFCache,
    // user qui repasse sur l'app après une autre, sortie de fullscreen
    // implicite). Sans ces handlers, le lock initial peut être perdu.
    const onPageShow = () => tryLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryLock();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
