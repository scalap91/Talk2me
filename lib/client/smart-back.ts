'use client';

/**
 * Talk2Me — Retour robuste (Pascal 2026-06-25, audit DeepSeek des liens de retour).
 *
 * Problème : router.back() / history.back() NE FAIT RIEN quand la page est ouverte
 * sans historique (lancement direct dans l'APK, deep-link, ou après un
 * window.location.replace qui écrase l'historique) → bouton retour mort, écran bloqué.
 *
 * smartBack() revient en arrière S'IL existe un historique, sinon va vers une
 * destination de repli logique (le parent de l'écran). Plus jamais d'écran coincé.
 *
 * Usage :
 *   const router = useRouter();
 *   ...
 *   <button onClick={() => smartBack(router, '/home')}>← Retour</button>
 */
interface MiniRouter {
  back: () => void;
  push: (href: string) => void;
}

export function smartBack(router: MiniRouter, fallback: string): void {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallback);
  }
}
