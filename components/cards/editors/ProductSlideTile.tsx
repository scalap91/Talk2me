'use client';

/**
 * Talk2Me — ProductSlideTile (Pascal 2026-06-11).
 * Produit du sélecteur affiché en 3 PAGES qu'on FAIT DÉFILER AU DOIGT (swipe
 * gauche/droite), directement dans le sélecteur — rien à ouvrir :
 *   1. BRUT     → photo source
 *   2. TRADUIT  → photo + nom nettoyé FR
 *   3. PRÊT     → image détourée (fond transparent) sur fond propre
 * Points indicateurs (● ○ ○) synchro sur le scroll. Tap une page = on choisit.
 * Détourage pas encore revenu → pages 2/3 montrent « en cours… » sans bloquer.
 */

import { useRef, useState } from 'react';
import { Loader2 } from '@/lib/icons';
import type { ProductCardData } from '@/lib/chat-types';

export interface TileCutout {
  title_clean: string;
  desc_clean: string;
  cutout_url: string | null;
}

interface Props {
  product: ProductCardData;
  cutout?: TileCutout | null;
  onPick: (finalized: ProductCardData) => void;
}

const CHECKER = 'repeating-conic-gradient(#2a2a33 0% 25%, #21212a 0% 50%) 50% / 18px 18px';

export default function ProductSlideTile({ product, cutout, onPick }: Props) {
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const titleClean = cutout?.title_clean || product.title;
  const pick = () => onPick({ ...product, title: titleClean, image_url: cutout?.cutout_url || product.image_url });

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* PAGE 1 — BRUT */}
        <button type="button" onClick={pick} className="relative min-w-full snap-center aspect-square bg-white/[0.05]">
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
          )}
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-black/65 text-white/90">BRUT</span>
          {product.price_label && <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-full text-[11px] font-semibold text-white bg-black/65">{product.price_label}</span>}
        </button>

        {/* PAGE 2 — TRADUIT */}
        <button type="button" onClick={pick} className="relative min-w-full snap-center aspect-square bg-white/[0.05]">
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="w-full h-full object-cover opacity-70" />
          )}
          <div className="absolute inset-0 flex items-end p-3 bg-gradient-to-t from-black/75 to-transparent">
            {cutout ? (
              <p className="text-white text-[14px] font-semibold leading-snug">{cutout.title_clean}</p>
            ) : (
              <p className="text-white/60 text-[12px] inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> nettoyage…</p>
            )}
          </div>
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-black/65 text-white/90">TRADUIT</span>
        </button>

        {/* PAGE 3 — PRÊT (détouré) */}
        <button type="button" onClick={pick} className="relative min-w-full snap-center aspect-square" style={{ background: CHECKER }}>
          {cutout?.cutout_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cutout.cutout_url} alt="" className="w-full h-full object-contain p-3" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-white/60 text-[12px] inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> détourage…</p>
            </div>
          )}
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-black/65 text-white/90">{cutout?.cutout_url ? 'PRÊT ✓' : 'PRÊT'}</span>
        </button>
      </div>

      {/* points + titre + action */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-white/90 line-clamp-1 flex-1">{titleClean}</p>
          <div className="flex gap-1 shrink-0">
            {[0, 1, 2].map((i) => (
              <span key={i} className={'h-1.5 rounded-full transition-all ' + (idx === i ? 'w-3 bg-white' : 'w-1.5 bg-white/35')} />
            ))}
          </div>
        </div>
        <button type="button" onClick={pick} className="mt-2 w-full py-2 rounded-lg bg-white text-black text-[12px] font-semibold active:scale-[0.99]">Choisir</button>
      </div>
    </div>
  );
}
