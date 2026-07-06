'use client';

import { useEffect, useState } from 'react';

/**
 * Badge « APP ✓ » — visible UNIQUEMENT dans le vrai APK natif (Capacitor).
 * Permet de distinguer d'un coup d'œil l'app installée (push FCM natif) du
 * navigateur / raccourci PWA (qui n'a pas le push natif). Pascal 2026-06-16.
 * Style inline = échappe au lockdown monochrome (repère technique, pas UI produit).
 */
export default function NativeBadge() {
  const [show, setShow] = useState(false);
  const [ver, setVer] = useState('');
  const [web, setWeb] = useState(''); // version WEB réelle (cache SW) → repère anti-cache
  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean }; __T2M_DEV?: boolean };
    const native = !!w.Capacitor && typeof w.Capacitor.isNativePlatform === 'function' && w.Capacitor.isNativePlatform();
    // Version APK lue dans le User-Agent (Talk2MeApp/x.y) — fiable, permet de
    // vérifier d'un coup d'œil quelle APK est réellement installée.
    const m = (navigator.userAgent || '').match(/Talk2MeApp\/([\d.]+)/);
    if (m) setVer(m[1]);
    // Badge visuel UNIQUEMENT en DEV (debug). En prod / Play Store : invisible.
    // La détection native reste dispo ailleurs (push/appels) — ce n'est que le repère visuel.
    setShow(native && w.__T2M_DEV === true);

    // Version WEB réelle : on demande au service worker quelle build le contrôle.
    // Si le numéro affiché est en retard sur la dernière build → c'est un cache périmé.
    if ('serviceWorker' in navigator) {
      const onMsg = (ev: MessageEvent) => {
        const d = ev.data as { type?: string; version?: string };
        if (d && d.type === 'SW_VERSION' && d.version) setWeb(d.version.replace('talk2me-', ''));
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      const ask = () => navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
      ask();
      const t = setTimeout(ask, 1500); // re-demande si le SW vient de prendre la main
      return () => { navigator.serviceWorker.removeEventListener('message', onMsg); clearTimeout(t); };
    }
  }, []);
  if (!show) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom) + 6px)',
        right: '8px',
        zIndex: 2147483646,
        pointerEvents: 'none',
        background: '#16a34a',
        color: '#fff',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        padding: '2px 7px',
        borderRadius: '9999px',
        boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
        opacity: 0.92,
      }}
    >
      APP{ver ? ` ${ver}` : ' ✓'}{web ? ` · ${web}` : ''}
    </div>
  );
}
