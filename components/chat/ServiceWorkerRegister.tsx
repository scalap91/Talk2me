'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker Talk2Me côté client (PWA).
 * Scope root `/` (servi sur talk2me.fr en root).
 *
 * Talk2Me 2026-06-07 (Pascal) — AUTO-UPDATE : les users ne voyaient pas les
 * nouvelles versions (le SW gardait les assets en cache). Maintenant :
 *  - on vérifie une MAJ au démarrage + au retour au premier plan,
 *  - dès qu'un nouveau SW prend le contrôle (controllerchange), on RECHARGE la
 *    page une fois (garde anti-boucle) → l'user a toujours la dernière version.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let reg: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((r) => {
        reg = r;
        // Cherche une MAJ tout de suite.
        r.update().catch(() => {});
      })
      .catch((err) => {
        // Pas de throw : un SW qui rate ne doit pas casser l'app
        console.warn('[Talk2Me] SW register failed:', err);
      });

    // Re-check quand l'app revient au premier plan (PWA rouverte).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && reg) reg.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
