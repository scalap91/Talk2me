'use client';

/**
 * Talk2Me — RÈGLE UNIQUE de navigation "retour" (Pascal 2026-06-22).
 * Tout bouton/porte de sortie ramène à la PAGE PRÉCÉDENTE (d'où on vient), jamais vers une
 * page codée en dur. Une seule règle, utilisée partout → fini les destinations dupliquées.
 * Fallback (accueil) seulement s'il n'y a pas d'historique (accès direct par URL).
 */
export function goBack(fallback = '/home'): void {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) {
    window.history.back();
    // Garde-fou RÈGLE D'OR : ne JAMAIS rester sur la conversation IA ('/').
    // Si le retour y atterrit, on bascule sur le feed.
    window.setTimeout(() => {
      if (window.location.pathname === '/') window.location.assign(fallback);
    }, 150);
  } else {
    window.location.assign(fallback);
  }
}

/**
 * Sortie d'une salle/pièce 3D → retour au FEED, ciblé sur LE POST d'où on est entré.
 * On mémorise le post ; `PostFeed` (#card-<id>) scrolle pile dessus. `history.back()` ne
 * suffit pas ici (le feed se recharge et repart du 1er post) — d'où cette règle dédiée.
 */
export function exitToFeedPost(postId?: string | null, feed = '/home'): void {
  if (typeof window === 'undefined') return;
  try { if (postId) sessionStorage.setItem('t2m_piece_return', postId); } catch { /* */ }
  window.location.assign(feed);
}
