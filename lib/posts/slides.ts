/**
 * Talk2Me — SOURCE UNIQUE de découpage d'un post en slides (Pascal 2026-06-09).
 *
 * Avant : 3 heuristiques divergentes (SelectionFAB, API, PostCard height-based)
 * → le nombre de slides annoncé ≠ nombre rendu → barre de progression fausse.
 *
 * Règle unique, déterministe, indépendante de la taille écran :
 *   • 1 message AVEC card riche (youtube/tiktok/place/recette/web_search/products/géoloc) = 1 slide
 *   • sinon, paquets de TEXT_PER_SLIDE messages texte → 1 slide
 *   • plafond MAX_SLIDES (le surplus est fusionné dans la dernière slide)
 *
 * Utilisée par : composer (SelectionFAB), garde-fou serveur (/api/posts),
 * et le rendu réel (PostCard) → les trois comptent désormais pareil.
 */

export const MAX_SLIDES = 6;
export const TEXT_PER_SLIDE = 4;

export interface SlideMessageLike {
  content?: string;
  youtube?: unknown;
  tiktok?: unknown;
  places?: unknown[] | null;
  recipe?: unknown;
  web_search?: { results?: unknown[] } | null;
  products?: unknown[] | null;
  requires_geoloc?: boolean;
}

/** Un message porte-t-il une card riche (= mérite sa propre slide) ? */
export function hasRichCard(m: SlideMessageLike): boolean {
  return (
    !!m.recipe ||
    (Array.isArray(m.places) && m.places.length > 0) ||
    (m.youtube !== undefined && m.youtube !== null) ||
    (m.tiktok !== undefined && m.tiktok !== null) ||
    m.requires_geoloc === true ||
    (Array.isArray(m.products) && m.products.length > 0) ||
    (!!m.web_search && Array.isArray(m.web_search.results) && m.web_search.results.length > 0)
  );
}

/** Découpe en slides (ordre chronologique strict, pas de re-shuffle). */
export function splitIntoSlides<T extends SlideMessageLike>(messages: T[]): T[][] {
  // ÉTAPES EXPLICITES (Pascal 2026-06-10) : un message « ## Titre » démarre une
  // NOUVELLE page. Permet « une page par étape » (carrousel) pour un process long.
  if (messages.some((m) => (m.content || '').startsWith('## '))) {
    const steps: T[][] = [];
    let cur: T[] = [];
    for (const m of messages) {
      if ((m.content || '').startsWith('## ') && cur.length > 0) { steps.push(cur); cur = []; }
      cur.push(m);
    }
    if (cur.length) steps.push(cur);
    if (steps.length > MAX_SLIDES) {
      const head = steps.slice(0, MAX_SLIDES - 1);
      const tail = steps.slice(MAX_SLIDES - 1).flat();
      return [...head, tail];
    }
    return steps;
  }

  // Post COURT (≤1 card riche, ≤5 messages) = UNE seule page.
  const richCount = messages.filter(hasRichCard).length;
  if (messages.length > 0 && messages.length <= 5 && richCount <= 1) return [messages];

  const slides: T[][] = [];
  let textBucket: T[] = [];
  const flush = () => { if (textBucket.length) { slides.push(textBucket); textBucket = []; } };

  for (const m of messages) {
    if (hasRichCard(m)) {
      flush();
      slides.push([m]);
    } else {
      textBucket.push(m);
      if (textBucket.length >= TEXT_PER_SLIDE) flush();
    }
  }
  flush();

  if (slides.length > MAX_SLIDES) {
    const head = slides.slice(0, MAX_SLIDES - 1);
    const tail = slides.slice(MAX_SLIDES - 1).flat();
    return [...head, tail];
  }
  return slides;
}

/** Nombre de slides (pour l'estimation composer + garde-fou serveur). */
export function countSlides(messages: SlideMessageLike[]): number {
  return splitIntoSlides(messages).length;
}
