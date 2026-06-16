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
  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean }; __T2M_DEV?: boolean };
    const native = !!w.Capacitor && typeof w.Capacitor.isNativePlatform === 'function' && w.Capacitor.isNativePlatform();
    // Badge visuel UNIQUEMENT en DEV (debug). En prod / Play Store : invisible.
    // La détection native reste dispo ailleurs (push/appels) — ce n'est que le repère visuel.
    setShow(native && w.__T2M_DEV === true);
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
      APP ✓
    </div>
  );
}
