'use client';

import { useEffect } from 'react';

/**
 * ChunkReloadGuard (Pascal 2026-07-12) — tue le « fantôme » du bundle périmé.
 *
 * Après un déploiement, le build Next.js change d'ID → les anciens chunks JS disparaissent.
 * Une WebView/onglet qui a encore l'ANCIEN bundle (ex. l'APK qui référence un écran supprimé
 * comme /composer) échoue à charger le chunk → `ChunkLoadError` → écran figé. Ici on l'attrape
 * et on force UN SEUL rechargement dur → la WebView repart sur le build à jour. Plus de fantôme.
 *
 * Garde-fou anti-boucle : pas plus d'1 reload / 15 s (si le chunk manque vraiment côté serveur,
 * on ne boucle pas à l'infini).
 */
const RX = /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export default function ChunkReloadGuard() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        const KEY = 't2m_chunk_reload_at';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < 15000) return; // déjà rechargé récemment → on stoppe (anti-boucle)
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch { /* sessionStorage indispo → on recharge quand même */ }
      try { window.location.reload(); } catch { /* */ }
    };
    const onErr = (e: ErrorEvent) => { if (RX.test(e?.message || '')) reloadOnce(); };
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e?.reason;
      const m = typeof r === 'string' ? r : (r?.message || r?.name || '');
      if (RX.test(String(m))) reloadOnce();
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  return null;
}
