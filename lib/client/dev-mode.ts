'use client';

/**
 * Mode développeur T2M (Pascal 2026-07-01) — comme le mode dev Android.
 * À activer dans le Profil. Débloque l'Inspecteur de Cards (capot moteur : JSON/source,
 * rayons pointus). L'édition SIMPLE (feutre : texte/photo/catégorie) reste dispo sans ça.
 * Purement client (localStorage) — ne donne AUCUN droit serveur (l'auth propriétaire
 * reste vérifiée côté serveur pour toute écriture).
 */
const KEY = 't2m_dev_mode';
const EVT = 't2m-dev-mode-change';

export function isDevMode(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDevMode(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: on })); } catch { /* */ }
}

/** S'abonner aux changements (pour rafraîchir un composant qui affiche « Inspecter »). */
export function onDevModeChange(cb: (on: boolean) => void): () => void {
  const h = () => cb(isDevMode());
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}
