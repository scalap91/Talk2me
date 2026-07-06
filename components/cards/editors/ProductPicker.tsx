'use client';

/**
 * Talk2Me #425 — ProductPicker : choisir un produit à attacher à une card
 * (gabarit Shop). Deux entrées (Pascal 2026-06-07) :
 *  - Recherche (moteur AliExpress /api/search/product, grounded, réel)
 *  - Coller un lien (extraction OpenGraph via /api/og : titre + image)
 * Doctrine [[content-grounding]] : titre/prix/image viennent de la source.
 */

import { useState, useCallback, useRef } from 'react';
import { X, Search, Link as LinkIcon, Loader2 } from '@/lib/icons';
import type { ProductCardData } from '@/lib/chat-types';

interface Props {
  onPick: (p: ProductCardData) => void;
  onClose: () => void;
}

interface Cutout { product_id: string; title_clean: string; cutout_url: string | null }
const CHECKER = 'repeating-conic-gradient(#2a2a33 0% 25%, #21212a 0% 50%) 50% / 18px 18px';
const PAGES = ['BRUT', 'TRADUIT', 'PRÊT'] as const;

export default function ProductPicker({ onPick, onClose }: Props) {
  const [tab, setTab] = useState<'search' | 'link'>('search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 3 PAGES de la grille (BRUT → TRADUIT → PRÊT), balayées au doigt
  const [cutoutMap, setCutoutMap] = useState<Record<string, Cutout>>({});
  const [pageIdx, setPageIdx] = useState(0);
  const pager = useRef<HTMLDivElement>(null);

  const gotoPage = (i: number) => {
    const el = pager.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setPageIdx(i);
  };

  const runSearch = useCallback(async () => {
    const term = q.trim();
    if (term.length < 2) return;
    setLoading(true);
    setErr(null);
    try {
      // 1) NOS produits (fournisseur CJ Dropshipping, déjà configuré) en priorité.
      let list: ProductCardData[] = [];
      try {
        const rc = await fetch(`/api/dropship/search?q=${encodeURIComponent(term)}&page=1`);
        const jc = await rc.json();
        if (jc?.configured && Array.isArray(jc?.products)) {
          list = (jc.products as { pid: string; name: string; image: string | null; sku: string | null }[])
            .filter((p) => p.image && p.name)
            .map((p) => ({
              id: `cj:${p.pid}`,
              title: p.name,
              image_url: p.image,
              price_label: null,           // prix CJ = coût fournisseur, l'user fixe son prix de vente
              currency: null,
              source: 'CJ' as const,
              source_url: `cj:${p.pid}`,
              condition: 'neuf' as const,
            }));
        }
      } catch { /* repli scraper ci-dessous */ }

      // 2) Repli : moteur de recherche public (AliExpress scrape / Bing) si CJ vide.
      if (!list.length) {
        const r = await fetch(`/api/search/product?query=${encodeURIComponent(term)}&limit=12`);
        const j = await r.json();
        list = Array.isArray(j?.products) ? j.products : [];
      }

      setResults(list);
      setCutoutMap({});
      setPageIdx(0);
      if (!list.length) { setErr('Aucun produit trouvé. Essaie des mots simples, sans accent.'); return; }
      // détourage + nettoyage de TOUTE la grille (alimente les pages TRADUIT et PRÊT)
      fetch('/api/product/cutout/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: list }),
      }).then((r) => r.json()).then((j) => {
        if (!Array.isArray(j?.cutouts)) return;
        const m: Record<string, Cutout> = {};
        for (const c of j.cutouts as Cutout[]) m[c.product_id] = { product_id: c.product_id, title_clean: c.title_clean, cutout_url: c.cutout_url };
        setCutoutMap(m);
      }).catch(() => {});
    } catch {
      setErr('Recherche indisponible pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  const fromUrl = useCallback(async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      setErr('Colle un lien valide (https://…).');
      return;
    }
    setUrlLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/og?url=${encodeURIComponent(u)}`);
      const j = await r.json();
      const title: string = j?.title || '';
      const image: string | null = j?.image || null;
      if (!title) {
        setErr("Impossible d'extraire ce lien.");
        return;
      }
      let host = '';
      try {
        host = new URL(u).hostname;
      } catch {
        /* noop */
      }
      const source: ProductCardData['source'] = /aliexpress/i.test(host)
        ? 'AliExpress'
        : 'Bing Shopping';
      onPick({
        id: `url-${u.slice(-24)}`,
        title,
        image_url: image,
        price_label: null,
        currency: null,
        source,
        source_url: u,
        condition: null,
      });
    } catch {
      setErr("Impossible d'extraire ce lien.");
    } finally {
      setUrlLoading(false);
    }
  }, [url, onPick]);

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#15151c] rounded-t-2xl border-t border-white/10 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/8">
          <span className="text-[14px] font-semibold text-white/95">Ajouter un produit</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* onglets */}
        <div className="flex gap-1.5 px-4 py-2 shrink-0">
          {([
            { k: 'search', label: 'Rechercher', Icon: Search },
            { k: 'link', label: 'Coller un lien', Icon: LinkIcon },
          ] as const).map(({ k, label, Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => { setTab(k); setErr(null); }}
              className={
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border ' +
                (tab === k
                  ? 'bg-white/[0.14] border-white/30 text-white'
                  : 'bg-transparent border-white/8 text-white/55')
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {tab === 'search' ? (
            <>
              <div className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="ex : ecouteurs bluetooth"
                  autoFocus
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={loading}
                  className="px-4 rounded-xl bg-white text-black text-[13px] font-medium disabled:opacity-50"
                >
                  {loading ? '…' : 'OK'}
                </button>
              </div>
              {results.length > 0 && (
                <>
                  {/* en-tête des 3 états */}
                  <div className="flex gap-1.5 mt-3">
                    {PAGES.map((lbl, i) => (
                      <button key={lbl} type="button" onClick={() => gotoPage(i)}
                        className={'flex-1 py-1.5 rounded-lg text-[11px] font-bold border ' + (pageIdx === i ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/10 bg-white/[0.04] text-white/45')}>
                        {i + 1}. {lbl}
                      </button>
                    ))}
                  </div>

                  {/* 3 PAGES balayées au doigt */}
                  <div ref={pager}
                    onScroll={() => { const el = pager.current; if (el) setPageIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
                    className="flex overflow-x-auto snap-x snap-mandatory mt-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {(['brut', 'traduit', 'pret'] as const).map((state) => (
                      <div key={state} className="min-w-full snap-center">
                        <div className="grid grid-cols-2 gap-2 pr-0">
                          {results.map((p) => {
                            const c = cutoutMap[p.id];
                            const title = state === 'brut' ? p.title : (c?.title_clean || p.title);
                            const img = state === 'pret' ? (c?.cutout_url || p.image_url) : p.image_url;
                            const pending = state !== 'brut' && !c;
                            return (
                              <button key={p.id} type="button"
                                onClick={() => onPick({ ...p, title: c?.title_clean || p.title, image_url: c?.cutout_url || p.image_url })}
                                className="text-left rounded-xl overflow-hidden border border-white/10 bg-white/[0.03] active:scale-[0.98] transition">
                                <div className="relative w-full aspect-square" style={state === 'pret' ? { background: CHECKER } : { background: 'rgba(255,255,255,0.06)' }}>
                                  {img ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={img} alt="" className={'w-full h-full ' + (state === 'pret' ? 'object-contain p-2' : 'object-cover')} loading="lazy" />
                                  ) : null}
                                  {pending && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Loader2 className="w-4 h-4 animate-spin text-white/70" /></div>}
                                  {p.price_label && <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold text-white bg-black/65">{p.price_label}</span>}
                                </div>
                                <div className="px-2 py-1.5 text-[11px] text-white/90 line-clamp-2 min-h-[2.6em]">{title}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-white/35 text-[10px] mt-2 text-center">Balaie ← → entre Brut · Traduit · Prêt. Tape un produit pour le choisir.</p>
                </>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fromUrl()}
                placeholder="https://… (lien produit)"
                autoFocus
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={fromUrl}
                disabled={urlLoading}
                className="w-full py-2.5 rounded-xl bg-white text-black text-[13px] font-medium disabled:opacity-50"
              >
                {urlLoading ? 'Extraction…' : 'Attacher ce lien'}
              </button>
              <p className="text-[11px] text-white/40">
                On récupère le titre et l&apos;image du lien. Le prix peut ne pas être disponible.
              </p>
            </div>
          )}

          {err && <p className="text-[12px] text-white/70 mt-3">{err}</p>}
        </div>
      </div>
    </div>
  );
}
