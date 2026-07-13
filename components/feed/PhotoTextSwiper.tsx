'use client';

/**
 * Talk2Me — SWIPER PHOTO↔TEXTE piloté en JS (Pascal 2026-07-09). Problème : un conteneur qui
 * scrolle horizontalement (overflow-x) CAPTURE le geste vertical dans le WebView → on ne peut plus
 * swiper haut/bas vers le post suivant. Ici AUCUN scroll : les pages sont posées côte à côte et
 * déplacées par un `transform`. On verrouille l'axe au 1er mouvement : horizontal → on gère nous-
 * mêmes ; vertical → on NE FAIT RIEN, le geste remonte au feed (post suivant). Déterministe.
 */
import { useRef, useState, useEffect, type ReactNode } from 'react';

export default function PhotoTextSwiper({ pages, onPage, initialPage = 0 }: { pages: ReactNode[]; onPage?: (i: number) => void; initialPage?: number }) {
  const n = pages.length;
  // Page de DÉPART (ex. karaoké à gauche → on démarre sur la description). Pascal 2026-07-13.
  const [page, setPage] = useState(initialPage);
  // Synchronise le parent (dots) sur la page de départ, une fois au montage.
  useEffect(() => { onPage?.(initialPage); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [drag, setDrag] = useState(0); // décalage en cours (px) pendant le geste horizontal
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'' | 'x' | 'y'>('');
  const width = useRef(1);

  function onStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    axis.current = '';
    width.current = e.currentTarget.clientWidth || 1;
  }
  function onMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) > Math.abs(dy) + 6) axis.current = 'x';
      else if (Math.abs(dy) > Math.abs(dx) + 6) axis.current = 'y';
      else return;
    }
    if (axis.current !== 'x') return; // vertical → on laisse le feed scroller (post suivant)
    // touch-action: pan-y libère déjà l'horizontal pour le JS (pas de preventDefault nécessaire).
    // résistance aux bords (première/dernière page)
    let d = dx;
    if ((page === 0 && dx > 0) || (page === n - 1 && dx < 0)) d = dx * 0.3;
    setDrag(d);
  }
  function onEnd() {
    if (axis.current === 'x') {
      const threshold = width.current * 0.22;
      let next = page;
      if (drag <= -threshold && page < n - 1) next = page + 1;
      else if (drag >= threshold && page > 0) next = page - 1;
      if (next !== page) { setPage(next); onPage?.(next); }
    }
    setDrag(0);
    axis.current = '';
  }

  return (
    <div
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
      /* SEULE la 1re page (photo) laisse passer le swipe VERTICAL au feed (post suivant) : pan-y.
         Sur les pages texte (page>0), touch-action:none → le vertical ne saute PLUS de post ;
         on revient d'abord à la photo en swipant horizontalement. Pascal 2026-07-09. */
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: page === 0 ? 'pan-y' : 'none' }}
    >
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: `${n * 100}%`,
          transform: `translate3d(calc(${-page * 100}% / ${n} + ${drag}px), 0, 0)`,
          transition: drag === 0 ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none',
        }}
      >
        {pages.map((pg, i) => (
          <div key={i} style={{ flex: `0 0 ${100 / n}%`, height: '100%', position: 'relative' }}>
            {pg}
          </div>
        ))}
      </div>
    </div>
  );
}
