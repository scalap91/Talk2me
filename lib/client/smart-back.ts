'use client';

/**
 * Talk2Me — Retour robuste (Pascal 2026-06-25 ; durci 2026-08-09 « fix une fois pour toute »).
 *
 * Problème : router.back() / history.back() NE FAIT RIEN d'utile quand la page est
 * ouverte sans historique DANS L'APP (lancement direct APK/PWA, deep-link, ou après un
 * window.location.replace) → bouton retour mort, écran bloqué. Et history.length est
 * inutilisable : il vaut souvent > 1 à cause des entrées propres au navigateur → on
 * appelait back() dans le vide.
 *
 * Solution : on se fie à l'index d'historique INTERNE de Next (window.history.state.idx),
 * qui compte les navigations DANS l'app. idx > 0 ⇒ il existe une page précédente de l'app
 * ⇒ back(). Sinon ⇒ on pousse le parent logique (fallback). En plus, un FILET : si 400 ms
 * après le back on est toujours sur la même URL (historique cassé, page qui se re-redirige),
 * on force le repli. Résultat : plus JAMAIS d'écran coincé.
 *
 * Usage :
 *   const router = useRouter();
 *   <button onClick={() => smartBack(router, '/profile')}>← Retour</button>
 */
interface MiniRouter {
  back: () => void;
  push: (href: string) => void;
}

export function smartBack(router: MiniRouter, fallback: string): void {
  if (typeof window === 'undefined') { router.push(fallback); return; }

  const idx = (window.history.state as { idx?: number } | null)?.idx;

  // Pas d'historique interne app (première entrée, deep-link, APK/PWA) → repli direct.
  if (typeof idx !== 'number' || idx <= 0) { router.push(fallback); return; }

  // Il y a une page app derrière → on revient, avec un filet anti-blocage.
  const before = window.location.pathname + window.location.search;
  router.back();
  window.setTimeout(() => {
    if (window.location.pathname + window.location.search === before) router.push(fallback);
  }, 400);
}
