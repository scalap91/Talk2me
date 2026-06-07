'use client';

/**
 * VideoTextOverlay — rendu CSS des textes overlay pendant l'édition vidéo.
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - preview SANS baking : ce composant simule en CSS ce que ffmpeg drawtext
 *    va finalement burn-in dans la vidéo finale.
 *  - Visibilité conditionnelle : on n'affiche que les textes dont la fenêtre
 *    [start_s, end_s] contient currentTime (par rapport à la vidéo FINALE,
 *    donc post-trim → currentTime - trim.start_s).
 *  - Positions : top / center / bottom (les mêmes que ffmpeg).
 */

import React from 'react';
import type { DraftTextOverlay } from '@/lib/card-draft-store';

interface Props {
  texts: DraftTextOverlay[];
  /** currentTime de l'élément <video>, donc dans la timeline SOURCE. */
  currentTimeSource: number;
  /** Trim courant (pour transformer source → finale). */
  trim: { start_s: number; end_s: number } | null;
}

function posStyle(position: 'top' | 'center' | 'bottom'): React.CSSProperties {
  switch (position) {
    case 'top':
      return { top: '6%', left: '50%', transform: 'translate(-50%, 0)' };
    case 'bottom':
      return { bottom: '6%', left: '50%', transform: 'translate(-50%, 0)' };
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}

function isVisible(
  text: DraftTextOverlay,
  currentTimeFinal: number
): boolean {
  // Si pas de fenêtre → visible tout au long de la vidéo finale
  if (typeof text.start_s !== 'number' && typeof text.end_s !== 'number') {
    return true;
  }
  const s = typeof text.start_s === 'number' ? text.start_s : 0;
  const e = typeof text.end_s === 'number' ? text.end_s : Infinity;
  return currentTimeFinal >= s && currentTimeFinal <= e;
}

export default function VideoTextOverlay({
  texts,
  currentTimeSource,
  trim,
}: Props) {
  // Transforme currentTime source → final (post-trim)
  const finalT = trim ? Math.max(0, currentTimeSource - trim.start_s) : currentTimeSource;

  if (texts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {texts.map((t) => {
        if (!isVisible(t, finalT)) return null;
        return (
          <div
            key={t.id}
            className="absolute px-3 py-1.5 rounded-md select-none"
            style={{
              ...posStyle(t.position),
              color: t.color,
              fontSize: `${t.fontSize}px`,
              fontWeight: 700,
              textShadow:
                '0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 2px 8px rgba(0,0,0,0.55)',
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
              maxWidth: '92%',
              textAlign: 'center',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}
          >
            {t.content}
          </div>
        );
      })}
    </div>
  );
}
