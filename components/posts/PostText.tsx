/**
 * Talk2Me — Modèle GÉNÉRIQUE du texte de post (Pascal 2026-06-21).
 * UN seul placement/format, utilisé par TOUS les écrans (Texte/Image/Vidéo…) :
 *  - Titre      : haut-centre, 2xl semibold, 2 lignes max.
 *  - Description: bas-gauche, 15px, 3 lignes max.
 *  - Hashtags   : bas-gauche, ROUGE 14px.
 *  - Tags @     : bas-gauche, bleu 14px.
 * Fini les divergences : si on veut changer le format d'un post, on change ICI.
 */
import React from 'react';

/** Bloc TITRE — à placer dans l'overlay HAUT de chaque écran. */
export function PostTitle({ title, className = '' }: { title?: string | null; className?: string }) {
  if (!title) return null;
  return (
    <h2 className={'text-center px-6 text-2xl font-semibold text-white leading-snug drop-shadow line-clamp-2 ' + className}>
      {title}
    </h2>
  );
}

/** Bloc DESCRIPTION + HASHTAGS (+ tags) — à placer dans l'overlay BAS de chaque écran. */
export function PostMeta({
  description, hashtags, tags,
}: { description?: string | null; hashtags?: string | null; tags?: string | null }) {
  return (
    <>
      {description ? (
        <p className="text-[15px] text-white text-left leading-snug whitespace-pre-line line-clamp-3 drop-shadow">{description}</p>
      ) : null}
      {hashtags ? (
        <p className="text-[14px] text-red-300 font-medium text-left drop-shadow">{hashtags}</p>
      ) : null}
      {tags ? (
        <p className="text-[14px] text-sky-300/90 font-medium text-left drop-shadow">{tags}</p>
      ) : null}
    </>
  );
}
