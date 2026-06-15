'use client';

import { useEffect, useState } from 'react';

/**
 * Rend ses enfants UNIQUEMENT sur l'environnement DEV (dev.talk2me.fr).
 * Le flag `window.__T2M_DEV` est injecté par app/layout.tsx (serveur, détecté
 * via la DB séparée). Sur BETA il vaut false → on ne rend rien.
 * Sert à garder une feature « pas au point » visible sur dev pour la peaufiner,
 * tout en la masquant de la beta (ex : avatars Léa 360°, créateur d'avatar).
 */
export default function DevOnly({ children }: { children: React.ReactNode }) {
  const [dev, setDev] = useState(false);
  useEffect(() => {
    setDev(typeof window !== 'undefined' && (window as unknown as { __T2M_DEV?: boolean }).__T2M_DEV === true);
  }, []);
  return dev ? <>{children}</> : null;
}
