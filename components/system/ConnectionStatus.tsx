'use client';

/**
 * Talk2Me — Indicateur de connexion (Pascal 2026-06-14).
 * Réseau faible/coupé (Afrique) : on prévient l'utilisateur au lieu de le laisser
 * croire que l'app plante. Bandeau « hors ligne », puis « connexion rétablie » bref.
 * Émet l'event window 't2m:reconnected' pour que les écrans rafraîchissent.
 * Monochrome, discret.
 */

import { useEffect, useState } from 'react';

export default function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    // état initial (évite un faux "hors ligne" au SSR)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setJustBack(true);
      try { window.dispatchEvent(new Event('t2m:reconnected')); } catch { /* */ }
      setTimeout(() => setJustBack(false), 2200);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  if (online && !justBack) return null;

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
    >
      <div
        className={
          'pointer-events-auto px-4 py-2 rounded-full text-[13px] font-semibold backdrop-blur-md border shadow-lg transition-opacity ' +
          (online
            ? 'bg-white/90 text-black border-white/40'
            : 'bg-black/80 text-white border-white/20')
        }
      >
        {online ? 'Connexion rétablie' : 'Pas de connexion — on réessaiera'}
      </div>
    </div>
  );
}
