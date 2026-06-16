'use client';

import { useEffect, useState } from 'react';

/**
 * Badge « APP ✓ » — visible UNIQUEMENT dans le vrai APK natif (Capacitor).
 * Permet de distinguer d'un coup d'œil l'app installée (push FCM natif) du
 * navigateur / raccourci PWA (qui n'a pas le push natif). Pascal 2026-06-16.
 * Style inline = échappe au lockdown monochrome (repère technique, pas UI produit).
 */
export default function NativeBadge() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    setNative(!!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  }, []);
  if (!native) return null;
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
