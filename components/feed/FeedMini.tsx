'use client';
/**
 * FeedMini — tuile mosaïque = le VRAI lecteur (AlignedPostCard) mis à l'échelle (Pascal). Utilisé
 * par TOUS les onglets Card (Publiées, Likées, Boutiques, Enregistrées) → même aperçu partout.
 * Extrait de app/drafts/page.tsx pour être partagé (un seul lecteur, zéro doublon).
 */
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import AlignedPostCard from '@/components/feed/AlignedPostCard';

export const FEED_MINI_REF_W = 400;
export type CardItem = ComponentProps<typeof AlignedPostCard>['item'];

export default function FeedMini({ item }: { item: CardItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ scale: 0.46, ar: 0.5 });
  useEffect(() => {
    const compute = () => {
      const el = ref.current; const inner = innerRef.current; if (!el || !inner) return;
      const w = el.clientWidth || 0; if (!w) return;
      // Hauteur RÉELLE de la card (pas 100svh figé) : une card texte est courte, une photo plein écran.
      const realH = inner.scrollHeight || (window.innerHeight || 800);
      setSt({ scale: w / FEED_MINI_REF_W, ar: FEED_MINI_REF_W / Math.max(realH, 1) });
    };
    compute();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null;
    if (ro && innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', compute);
    return () => { ro?.disconnect(); window.removeEventListener('resize', compute); };
  }, []);
  return (
    <div ref={ref} className="w-full relative overflow-hidden bg-black" style={{ aspectRatio: String(st.ar) }}>
      <div ref={innerRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: FEED_MINI_REF_W, transform: `scale(${st.scale})`, transformOrigin: 'top left' }}>
        <AlignedPostCard item={item} />
      </div>
    </div>
  );
}
