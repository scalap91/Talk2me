'use client';

import { useEffect } from 'react';

/**
 * Talk2Me — ENREGISTREMENT du service worker PWA (Pascal 2026-07-28).
 *
 * On enregistre `/sw.js` (network-first sûr) → l'app devient installable sur Chrome/Edge
 * (leur bouton « Installer » exige un SW avec handler `fetch`) + secours hors-ligne.
 * Le SW ne séquestre JAMAIS la navigation (network-first, redirections reconstruites) →
 * plus de about:blank ni de bundle périmé. Historique du kill-switch : [[feedback_sw_redirect_about_blank]].
 * macOS Safari « Ajouter au Dock » n'a pas besoin du SW (manifest seul) mais en profite aussi.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});

    // Quand un NOUVEAU SW prend le contrôle (1re install ou nouveau déploiement), on recharge
    // UNE fois pour appliquer les assets frais. Garde anti-boucle : une seule fois par page.
    let refreshing = false;
    const onChange = () => { if (refreshing) return; refreshing = true; window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);

  return null;
}
