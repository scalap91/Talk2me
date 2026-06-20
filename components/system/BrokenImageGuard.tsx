'use client';

/**
 * BrokenImageGuard (Pascal 2026-06-16) — AUCUNE image cassée sur Talk2Me.
 *
 * Suite à la perte des anciens fichiers d'uploads, la base référence des
 * images qui n'existent plus (404). Plutôt qu'afficher l'icône "image cassée"
 * du navigateur, ce garde global intercepte CHAQUE erreur de chargement d'image
 * (phase capture, car l'évènement `error` des <img> ne bulle pas) et remplace
 * la source par un **placeholder propre** :
 *   - image ronde / petite (avatar) → silhouette de profil (invite à mettre une photo)
 *   - autre image → vignette neutre "image indisponible"
 * Marche pour TOUTES les <img> du site sans toucher aux 33 composants.
 */
import { useEffect } from 'react';

// Silhouette de profil (cercle + buste) — data URI, ne peut pas échouer.
const PROFILE_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%232a2a35'/%3E%3Cstop offset='1' stop-color='%231a1a22'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3Ccircle cx='50' cy='40' r='17' fill='%23565663'/%3E%3Cpath d='M22 84c0-16 12-26 28-26s28 10 28 26z' fill='%23565663'/%3E%3C/svg%3E";

// Vignette neutre pour les images de contenu (cartes, posts).
const IMG_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 90'%3E%3Crect width='120' height='90' fill='%231c1c24'/%3E%3Cg fill='none' stroke='%234a4a57' stroke-width='3'%3E%3Crect x='30' y='28' width='60' height='42' rx='4'/%3E%3Ccircle cx='46' cy='44' r='6'/%3E%3Cpath d='M34 64l16-14 10 8 12-12 14 14'/%3E%3C/g%3E%3C/svg%3E";

function looksLikeAvatar(img: HTMLImageElement): boolean {
  const cls = img.className || '';
  if (/rounded-full|avatar|rounded-2xl/i.test(cls)) return true;
  const r = img.getBoundingClientRect();
  // petit + ~carré → traité comme avatar
  return r.width <= 96 && Math.abs(r.width - r.height) <= 8;
}

export default function BrokenImageGuard() {
  useEffect(() => {
    const onError = (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (!img || img.tagName !== 'IMG') return;
      if (img.dataset.fallbackApplied) return; // évite toute boucle
      // ne touche pas aux images déjà en data:/blob:
      if (/^(data:|blob:)/.test(img.currentSrc || img.src || '')) return;
      img.dataset.fallbackApplied = '1';
      img.srcset = '';
      img.src = looksLikeAvatar(img) ? PROFILE_SVG : IMG_SVG;
      img.style.objectFit = 'cover';
    };
    document.addEventListener('error', onError, true); // capture : les erreurs d'<img> ne bullent pas
    return () => document.removeEventListener('error', onError, true);
  }, []);
  return null;
}
