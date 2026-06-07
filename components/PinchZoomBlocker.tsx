'use client';

import { useEffect } from 'react';

/**
 * Talk2Me #404 (Pascal 2026-06-05) — Bloqueur pinch-zoom 2 doigts runtime.
 *
 * Pascal verbatim : "LE ZOOM DEUX DOIGT FONCTIONNE FIX SA".
 *
 * Cause : viewport `userScalable=false` est IGNORÉ par Chromium Android quand
 * "Force enable zoom" est activé dans Chrome (par défaut chez certains users
 * pour accessibilité). De même Samsung Internet le respecte mal.
 *
 * Fix dur : intercepte tout `touchstart`/`touchmove` avec 2+ doigts ET les
 * events `gesturestart`/`gesturechange` (iOS). preventDefault() force au
 * niveau JS — quels que soient les meta viewport ou la config browser.
 */
export default function PinchZoomBlocker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches && e.touches.length >= 2) {
        e.preventDefault();
      }
    };

    const blockGesture = (e: Event) => {
      e.preventDefault();
    };

    // iOS gesture* events (non standard mais utilisés par Safari/WebKit)
    const blockWheel = (e: WheelEvent) => {
      // Ctrl+wheel = pinch zoom sur trackpad. Pas pertinent sur mobile mais
      // protège le mode desktop dev.
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', blockMultiTouch, { passive: false });
    document.addEventListener('touchmove', blockMultiTouch, { passive: false });
    document.addEventListener('gesturestart', blockGesture as EventListener, {
      passive: false,
    });
    document.addEventListener('gesturechange', blockGesture as EventListener, {
      passive: false,
    });
    document.addEventListener('gestureend', blockGesture as EventListener, {
      passive: false,
    });
    document.addEventListener('wheel', blockWheel, { passive: false });
    // Double-tap zoom : intercepte le 2e tap rapide
    let lastTap = 0;
    const blockDoubleTap = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.preventDefault();
      }
      lastTap = now;
    };
    document.addEventListener('touchend', blockDoubleTap, { passive: false });

    return () => {
      document.removeEventListener('touchstart', blockMultiTouch);
      document.removeEventListener('touchmove', blockMultiTouch);
      document.removeEventListener('gesturestart', blockGesture as EventListener);
      document.removeEventListener('gesturechange', blockGesture as EventListener);
      document.removeEventListener('gestureend', blockGesture as EventListener);
      document.removeEventListener('wheel', blockWheel);
      document.removeEventListener('touchend', blockDoubleTap);
    };
  }, []);

  return null;
}
