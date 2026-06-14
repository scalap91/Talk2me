'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * Talk2Me #428 — Carte boutique DANS le feed Shop. MÊME TAILLE / FORME que la
 * carte article (ShopCard) : carré max-w-[340px], rounded-3xl, image aspect-square,
 * centrée. Pascal 2026-06-08.
 */

import Link from 'next/link';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';

interface BoutiqueFeedCardProps {
  boutique: {
    id: string;
    name: string;
    description: string | null;
    cover_url: string | null;
    cover_position?: string | null;
  };
}

export default function BoutiqueFeedCard({ boutique }: BoutiqueFeedCardProps) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  // Swipe vers la GAUCHE → ouvre la vitrine de la boutique (en plus du bouton).
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      router.push(`/boutique/${boutique.id}`);
    }
  };

  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center p-5"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Indice swipe */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/30 text-[11px] flex flex-col items-center gap-1 pointer-events-none">
        <span className="text-2xl leading-none">‹</span>
        <span className="rotate-90 whitespace-nowrap origin-center">swipe</span>
      </div>
      <div className="w-full max-w-[340px] rounded-3xl overflow-hidden bg-[#15151c] border border-white/20 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        {/* Image carrée = exactement la carte article */}
        <div className="relative w-full aspect-square bg-white/5">
          {boutique.cover_url ? (
            <img
              src={boutique.cover_url}
              alt={boutique.name}
              draggable={false}
              className="w-full h-full object-cover"
              style={{ objectPosition: boutique.cover_position || 'center center' }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-800 via-red-900 to-indigo-950" />
          )}
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-red-100 bg-red-500/80 backdrop-blur">
            Boutique
          </span>
        </div>
        <div className="p-4">
          <div className="text-[15px] font-semibold text-white/95 leading-snug line-clamp-2">
            {boutique.name}
          </div>
          {boutique.description ? (
            <div className="text-[12px] text-white/50 mt-1 line-clamp-1">{boutique.description}</div>
          ) : (
            <div className="text-[12px] text-white/50 mt-1">&nbsp;</div>
          )}
          <Link
            href={`/boutique/${boutique.id}`}
            className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/40 text-red-100 text-[13px] font-medium active:scale-[0.98] transition"
          >
            Voir la boutique ›
          </Link>
          <p className="mt-2 text-center text-[11px] text-white/40">
            Boutique de la communauté
          </p>
        </div>
      </div>
    </div>
  );
}
