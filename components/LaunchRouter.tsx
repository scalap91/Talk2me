'use client';

/**
 * Talk2Me — Reprise sur la dernière page (Pascal 2026-06-11).
 * L'appli (surtout l'APK, qui charge la racine `/` = le chat Léa) s'ouvrait
 * TOUJOURS sur le chat. Ici : on mémorise la dernière page visitée, et au
 * démarrage on y redirige. 1er lancement (aucune page mémorisée) → le Hub (/home).
 *
 * - La redirection ne se fait qu'UNE fois par lancement (sessionStorage), et
 *   seulement si on atterrit sur une entrée "par défaut" (`/` ou `/home`), pour
 *   ne pas casser les liens profonds (ex : ouverture via une notif → /c/xxx).
 */
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const KEY = 't2m-lastPath';
const HUB = '/home';

export default function LaunchRouter() {
  const pathname = usePathname();
  const router = useRouter();
  const launchHandled = useRef(false);

  // Redirection au démarrage (une seule fois par lancement d'appli).
  useEffect(() => {
    if (typeof window === 'undefined' || launchHandled.current) return;
    launchHandled.current = true;
    try {
      if (sessionStorage.getItem('t2m-launched')) return; // déjà lancé cette session
      const entry = window.location.pathname;
      // On ne touche qu'aux entrées par défaut (racine = chat Léa, ou Hub).
      if (entry !== '/' && entry !== '/home') return;
      sessionStorage.setItem('t2m-launched', '1');
      const last = localStorage.getItem(KEY);
      const target = last && last.startsWith('/') && last !== '/signin' ? last : HUB;
      if (target !== entry) router.replace(target);
    } catch { /* no-op */ }
  }, [router]);

  // Mémorise la page courante à chaque navigation.
  useEffect(() => {
    if (!pathname) return;
    if (pathname === '/signin' || pathname.startsWith('/api')) return;
    try { localStorage.setItem(KEY, pathname); } catch { /* no-op */ }
  }, [pathname]);

  return null;
}
