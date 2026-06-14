'use client';

/**
 * Talk2Me — ProductCutoutSlides (Pascal 2026-06-11, « intelligence circulaire »).
 * Affiche un produit en 3 slides = la pipeline rendue visible :
 *   1. BRUT            → photo source + titre source (spam)
 *   2. TRADUIT/PROPRE  → titre + description nettoyés (FR, sans invention)
 *   3. PRÊT À ENVOYER  → image DÉTOURÉE (fond transparent) + variantes → [Envoyer]
 * Doctrine [[content-grounding]] : tout vient d'une vraie source, rien d'inventé.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Send, Loader2 } from 'lucide-react';
import type { ProductCardData } from '@/lib/chat-types';

interface Variant { color: string; image_url?: string | null }
interface Cutout {
  src_url: string; title_raw: string; title_clean: string; desc_clean: string;
  cutout_url: string | null; price_label: string | null; source: string;
  source_url: string; variants: Variant[];
}

interface Props {
  product: ProductCardData;
  onSend: (finalized: ProductCardData) => void;
  onClose: () => void;
}

const STEPS = [
  { key: 'brut', label: 'BRUT', hint: 'Photo & titre source' },
  { key: 'propre', label: 'TRADUIT', hint: 'Nettoyé en français' },
  { key: 'pret', label: 'PRÊT À ENVOYER', hint: 'Détouré + variantes' },
] as const;

export default function ProductCutoutSlides({ product, onSend, onClose }: Props) {
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/product/cutout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product }),
        });
        const j = await r.json();
        if (!alive) return;
        if (j?.ok && j.cutout) setCutout(j.cutout as Cutout);
        else setErr(j?.error === 'gpu_off' ? 'Moteur détourage indisponible.' : 'Traitement impossible.');
      } catch {
        if (alive) setErr('Traitement impossible.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [product]);

  const goto = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIdx(i);
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const titleClean = cutout?.title_clean || product.title;
  const prettyImg = cutout?.cutout_url || product.image_url;

  const send = () => {
    onSend({
      ...product,
      title: titleClean,
      image_url: prettyImg || product.image_url,
      price_label: cutout?.price_label ?? product.price_label,
      source_url: cutout?.source_url || product.source_url,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#15151c] rounded-t-2xl border-t border-white/10 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/8">
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-white/95">
            <Sparkles className="w-4 h-4 text-red-300" /> Aperçu produit
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/75">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* steps */}
        <div className="flex gap-1.5 px-4 py-2 shrink-0">
          {STEPS.map((s, i) => (
            <button key={s.key} type="button" onClick={() => goto(i)}
              className={'flex-1 rounded-lg py-1.5 text-center border transition ' +
                (idx === i ? 'bg-red-500/15 border-red-400/30' : 'bg-transparent border-white/8')}>
              <span className={'block text-[10px] font-bold tracking-wide ' + (idx === i ? 'text-red-100' : 'text-white/45')}>{i + 1}. {s.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="w-7 h-7 text-red-300 animate-spin" />
            <p className="text-[12px] text-white/55">Détourage + nettoyage…</p>
          </div>
        ) : err ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <p className="text-[13px] text-red-300/90">{err}</p>
            <button type="button" onClick={send} className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/85 text-[13px]">
              Envoyer la version brute
            </button>
          </div>
        ) : (
          <>
            {/* slides */}
            <div ref={scroller} onScroll={onScroll}
              className="flex-1 overflow-x-auto flex snap-x snap-mandatory scroll-smooth no-scrollbar">
              {/* 1 BRUT */}
              <section className="min-w-full snap-center px-4 py-3">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.image_url && <img src={product.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="inline-block mt-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/60">SOURCE — {cutout?.source || product.source}</span>
                <p className="mt-1.5 text-[12px] text-white/55 line-clamp-3">{cutout?.title_raw || product.title}</p>
              </section>

              {/* 2 TRADUIT */}
              <section className="min-w-full snap-center px-4 py-3">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/8 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.image_url && <img src={product.image_url} alt="" className="w-full h-full object-cover opacity-60" />}
                  <div className="absolute inset-0 flex items-end p-3 bg-gradient-to-t from-black/70 to-transparent">
                    <p className="text-[15px] font-semibold text-white leading-snug">{titleClean}</p>
                  </div>
                </div>
                <span className="inline-block mt-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-200">PROPRE & TRADUIT</span>
                <p className="mt-1.5 text-[12px] text-white/70">{cutout?.desc_clean || '—'}</p>
              </section>

              {/* 3 PRÊT */}
              <section className="min-w-full snap-center px-4 py-3">
                <div
                  className="w-full aspect-square rounded-xl overflow-hidden border border-white/8 flex items-center justify-center"
                  style={{ background: 'repeating-conic-gradient(#2a2a33 0% 25%, #21212a 0% 50%) 50% / 22px 22px' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {prettyImg && <img src={prettyImg} alt="" className="w-full h-full object-contain p-3" />}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/15 text-emerald-200">{cutout?.cutout_url ? 'DÉTOURÉ ✓' : 'PRÊT'}</span>
                  {(cutout?.price_label || product.price_label) && (
                    <span className="text-[13px] font-semibold text-white">{cutout?.price_label || product.price_label}</span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] font-medium text-white/90">{titleClean}</p>
                {!!cutout?.variants?.length && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cutout.variants.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-white/[0.06] border border-white/10 text-white/70">{v.color}</span>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* dots + action */}
            <div className="shrink-0 px-4 pb-4 pt-1 border-t border-white/8">
              <div className="flex justify-center gap-1.5 py-2">
                {STEPS.map((_, i) => (
                  <span key={i} className={'h-1.5 rounded-full transition-all ' + (idx === i ? 'w-5 bg-red-400' : 'w-1.5 bg-white/20')} />
                ))}
              </div>
              <button type="button" onClick={send}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99]">
                <Send className="w-4 h-4" /> Envoyer ce produit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
