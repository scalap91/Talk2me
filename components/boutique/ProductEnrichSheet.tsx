'use client';

/**
 * Feuille « Nettoyer & enrichir » d'un produit (Pascal 2026-06-11).
 * 3 slides du MÊME produit : Brut (original gardé) → Brut+traduction → Rendu fiche
 * (image nettoyée + texte traduit + stock + couleurs). L'originale n'est jamais
 * perdue. La photo est nettoyée sur notre serveur (rembg, sans GPU).
 */

import { useState, useRef } from 'react';
import { X, Loader2, Wand2, Check, ChevronLeft, ChevronRight } from '@/lib/icons';

const SLIDE_TITLES = ['Brut', 'Français', 'Aperçu réel boutique', 'Boutique'];

interface Slide {
  stage: 'brut' | 'brut_trad' | 'final' | 'boutique';
  label: string;
  imageUrl: string;
  title: string;
  description: string;
  stockLabel?: string;
  colors?: string[];
}
interface Props {
  imageUrl: string;
  title: string;
  description?: string;
  price?: string;
  // Rôle du spectateur : public = voit seulement la fiche ; admin/vérificateur =
  // accès aux slides enrichies (validation). owner (composer) = tout.
  role?: 'owner' | 'admin' | 'verificateur' | 'public';
  onClose: () => void;
  // renvoie l'image nettoyée à utiliser (l'originale est conservée par l'appelant)
  onApply: (r: { cleanedUrl: string | null; originalUrl: string }) => void;
}

const COLOR_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Noir', hex: '#111' }, { name: 'Blanc', hex: '#fff' }, { name: 'Rouge', hex: '#dc2626' },
  { name: 'Bleu', hex: '#2563eb' }, { name: 'Vert', hex: '#16a34a' }, { name: 'Beige', hex: '#d8c3a5' },
];

export default function ProductEnrichSheet({ imageUrl, title, description, price, role = 'owner', onClose, onApply }: Props) {
  const [inStock, setInStock] = useState(true);
  const [colors, setColors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [viewRole, setViewRole] = useState<'public' | 'verificateur' | 'admin'>(role === 'public' ? 'public' : 'admin');
  const trackRef = useRef<HTMLDivElement>(null);

  const toggleColor = (c: string) => setColors((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const run = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/boutique/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, title, description: description || '', inStock, colors }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Échec'); return; }
      setSlides(d.slides); setCleanedUrl(d.cleanedUrl); setIdx(0);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // 4ᵉ slide « Boutique » (où est le produit dans le shop) + gating par rôle :
  // public = seulement la 1ʳᵉ fiche ; admin/vérificateur/owner = toutes les slides.
  const finalSlide = slides?.find((s) => s.stage === 'final');
  const fullSlides: Slide[] | null = slides ? [...slides, {
    stage: 'boutique', label: 'Boutique', imageUrl: cleanedUrl || imageUrl,
    title: finalSlide?.title || title, description: finalSlide?.description || '',
    stockLabel: finalSlide?.stockLabel, colors: finalSlide?.colors,
  }] : null;
  const visibleSlides: Slide[] | null = fullSlides ? (viewRole === 'public' ? fullSlides.slice(0, 1) : fullSlides) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[94dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2"><Wand2 className="w-5 h-5 text-red-400" /> Nettoyer & enrichir</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        {!visibleSlides ? (
          <div className="space-y-4">
            <img src={imageUrl} alt="" className="w-full max-h-[34dvh] object-contain rounded-2xl bg-black/30" />
            <div>
              <label className="text-white/60 text-[12px] mb-1.5 block">Disponibilité</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setInStock(true)} className={'py-2 rounded-xl text-[13px] border ' + (inStock ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-white/12 bg-white/[0.05] text-white/70')}>En stock</button>
                <button onClick={() => setInStock(false)} className={'py-2 rounded-xl text-[13px] border ' + (!inStock ? 'border-red-400/60 bg-red-500/15 text-red-200' : 'border-white/12 bg-white/[0.05] text-white/70')}>Épuisé</button>
              </div>
            </div>
            <div>
              <label className="text-white/60 text-[12px] mb-1.5 block">Couleurs disponibles</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((c) => (
                  <button key={c.name} onClick={() => toggleColor(c.name)}
                    className={'flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-[12px] ' + (colors.includes(c.name) ? 'border-red-400/60 bg-red-500/15 text-white' : 'border-white/12 bg-white/[0.05] text-white/70')}>
                    <span className="w-4 h-4 rounded-full border border-white/30" style={{ background: c.hex }} />{c.name}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-300 text-[13px] bg-red-500/10 border border-red-400/30 rounded-xl px-3 py-2">{error}</p>}
            <button onClick={run} disabled={busy} className="w-full py-3.5 rounded-xl bg-red-600 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Nettoyage + traduction…</> : <><Wand2 className="w-5 h-5" /> Générer les 3 slides</>}
            </button>
            <p className="text-white/35 text-[11px] text-center">L'originale est toujours conservée. Détourage fait sur notre serveur.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* TEST RÔLE : voir ce que chaque rôle affiche */}
            <div>
              <div className="text-white/40 text-[11px] mb-1 text-center">Aperçu selon le rôle qui regarde :</div>
              <div className="grid grid-cols-3 gap-1.5">
                {([['public', '👤 Public'], ['verificateur', '🔎 Vérificateur'], ['admin', '🛡️ Admin']] as const).map(([r, lbl]) => (
                  <button key={r} onClick={() => { setViewRole(r); setIdx(0); trackRef.current?.scrollTo({ left: 0 }); }}
                    className={'py-1.5 rounded-lg text-[11px] border ' + (viewRole === r ? 'border-red-400/60 bg-red-500/15 text-red-100' : 'border-white/12 bg-white/[0.05] text-white/60')}>
                    {lbl}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-[11px] mt-1.5 text-center inline-flex items-center justify-center gap-1.5 w-full">
                {viewRole === 'public' ? <>👤 le client voit juste la fiche (1 slide)</> : <><ChevronLeft className="w-4 h-4" /> glisse entre les {visibleSlides.length} versions (validation) <ChevronRight className="w-4 h-4" /></>}
              </p>
            </div>

            {/* CAROUSEL swipe au doigt — chaque slide = la fiche complète */}
            <div
              ref={trackRef}
              onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}
              className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-1 px-1 pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {visibleSlides.map((s, i) => (
                <div key={i} className="snap-center shrink-0 w-full">
                  {/* titre de la slide */}
                  <div className="mb-2 text-center">
                    <span className="text-white font-semibold text-[15px]">{SLIDE_TITLES[i] || s.label}</span>
                    <span className="block text-white/40 text-[11px]">{i + 1}/{visibleSlides.length}</span>
                  </div>

                  {s.stage === 'boutique' ? (
                    /* 4ᵉ slide : OÙ EST LE PRODUIT dans la boutique (mini-aperçu shop) */
                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0c0c11] p-3">
                      <div className="h-8 rounded-lg bg-gradient-to-r from-red-600/40 to-red-600/10 flex items-center px-3 mb-2"><span className="text-white/80 text-[12px] font-semibold">Ma boutique</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        {[0, 1, 2, 3].map((k) => k === 1 ? (
                          <div key={k} className="rounded-lg overflow-hidden ring-2 ring-red-500 relative">
                            <img src={s.imageUrl} alt="" className="w-full aspect-square object-cover bg-white" />
                            <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white bg-black/70 rounded px-1 py-0.5 text-center">← ce produit</span>
                          </div>
                        ) : (
                          <div key={k} className="rounded-lg bg-white/[0.06] aspect-square flex items-center justify-center text-white/20 text-[11px]">produit</div>
                        ))}
                      </div>
                      <p className="text-white/40 text-[11px] mt-2 text-center">Voilà où ta fiche apparaît dans la boutique.</p>
                    </div>
                  ) : (
                    <>
                      {/* LA FICHE (rendu site) */}
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-white text-black">
                        <div className="relative bg-white grid place-items-center" style={{ minHeight: '38dvh' }}>
                          <img src={s.imageUrl} alt="" className="w-full max-h-[44dvh] object-contain" />
                          {/* Badge « Generated » : aperçu SEULEMENT — jamais sur la boutique en ligne. */}
                          {s.stage !== 'brut' && (
                            <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white bg-red-600/90 rounded-full px-2 py-0.5">✨ Generated</span>
                          )}
                        </div>
                        <div className="p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-[15px] leading-snug">{s.title}</h3>
                            {price && <span className="font-bold text-[15px] text-red-600 whitespace-nowrap">{price}</span>}
                          </div>
                          {s.description && <p className="text-[12px] text-gray-600 leading-snug line-clamp-3">{s.description}</p>}
                          {s.stage === 'final' && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className={'text-[11px] font-semibold px-2 py-0.5 rounded ' + (s.stockLabel === 'Épuisé' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>{s.stockLabel}</span>
                              {!!s.colors?.length && (
                                <span className="flex items-center gap-1">
                                  {s.colors.map((c) => { const sw = COLOR_SWATCHES.find((x) => x.name === c); return <span key={c} title={c} className="w-4 h-4 rounded-full border border-gray-300" style={{ background: sw?.hex || '#999' }} />; })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Sous la photo nettoyée → l'ORIGINALE en dessous (toujours gardée) */}
                      {s.stage === 'final' && cleanedUrl && (
                        <div className="mt-2 flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-xl p-2">
                          <img src={imageUrl} alt="originale" className="w-14 h-14 rounded-lg object-cover bg-black/30 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-white/80 text-[12px] font-medium">Photo originale</div>
                            <div className="text-white/40 text-[11px]">conservée — jamais supprimée</div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* points indicateurs */}
            <div className="flex items-center justify-center gap-1.5">
              {visibleSlides.map((_, i) => (
                <span key={i} className={'h-1.5 rounded-full transition-all ' + (idx === i ? 'w-5 bg-red-400' : 'w-1.5 bg-white/25')} />
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setSlides(null); }} className="flex-1 py-3 rounded-xl bg-white/10 text-white/85 text-[14px] font-medium">Refaire</button>
              <button onClick={() => onApply({ cleanedUrl, originalUrl: imageUrl })} disabled={!cleanedUrl}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
                <Check className="w-4 h-4" /> Utiliser le rendu
              </button>
            </div>
            <p className="text-white/35 text-[11px] text-center">Slide 1 = brut (gardé) · 2 = texte FR · 3 = comme sur le site.</p>
          </div>
        )}
      </div>
    </div>
  );
}
