'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker Talk2Me côté client (PWA).
 * Scope root `/` (servi sur talk2me.fr en root).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Pas de throw : un SW qui rate ne doit pas casser l'app
        console.warn('[Talk2Me] SW register failed:', err);
      });
  }, []);

  return null;
}
