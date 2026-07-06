'use client';

import { useEffect } from 'react';

/**
 * Talk2Me — DÉSACTIVATION du service worker (Pascal 2026-07-05).
 *
 * On n'enregistre PLUS de service worker. Au contraire : à chaque chargement, on
 * désenregistre tout SW encore présent et on purge les caches. Cause : les SW
 * séquestraient la navigation (about:blank sur les pages qui redirigent, /live
 * servi pour toutes les URLs). Navigation 100% native = fini ces bugs.
 * Doctrine [[feedback_sw_redirect_about_blank]]. Réintroduire un SW un jour ?
 * → uniquement push, et JAMAIS de handler sur les navigations.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Désenregistre tout SW encore actif (purge les stale qui cassaient la nav).
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => { r.unregister().catch(() => {}); }))
      .catch(() => {});
    // Vide tous les caches du SW.
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => { caches.delete(k).catch(() => {}); })).catch(() => {});
    }
  }, []);

  return null;
}
