'use client';

/**
 * Talk2Me — Fiche produit COMPLÈTE (#25) ouverte DANS la boutique.
 * Extrait TOUT (pas juste desc+photo) : galerie, couleurs, tailles, styles,
 * prix/image par variante, description FR, poids/catégorie. Le prix et l'image
 * s'ajustent selon la variante choisie (couleur + taille).
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { useCardCreationStore } from '@/lib/card-creation-store';
import { COUNTRIES } from '@/lib/countries';

export interface SheetProduct {
  cardId?: string; // fiche d'une card existante
  pid?: string; // OU preview direct par pid (sélecteur, avant publication)
  title: string;
  image: string | null;
  price_label: string;
  sizes?: string | null;
}

interface Variant {
  values: Record<string, string>;
  cost: number | null;
  suggest?: number | null;
  image: string | null;
  sku: string | null;
  vid?: string;
}

// Petites marges (marketplace du peuple, Pascal 2026-06-20) : on raisonne en %
// de marge SUR LE COÛT produit (défaut 10 %), pas en gros multiplicateur.
const DEFAULT_MARKUP = 10; // %
// Chaîne réelle vers Madagascar : Chine→Paris (CJ) PUIS Paris→Antananarivo (notre transport).
// Tant qu'on n'a pas le vrai tarif Paris→Tana, on l'ESTIME = même coût que Chine→Paris.
// → total ≈ port CJ × ce facteur. Mettre la vraie valeur ici dès qu'on l'a (ex. €/kg).
const PARIS_TANA_MULT = 2; // 1× CJ (Chine→Paris) + 1× (Paris→Tana estimé identique)
const sellPrice = (c: number | null, mk: number): number | null =>
  c != null && isFinite(c) && c > 0 ? Math.max(1, Math.round(c * (1 + mk / 100))) : null;
const priceLabel = (c: number | null, mk: number): string => {
  const s = sellPrice(c, mk);
  return s != null ? `${s} €` : '';
};

export default function ProductDetailSheet({
  product,
  onClose,
  defaultCountry = 'FR',
}: {
  product: SheetProduct;
  onClose: () => void;
  defaultCountry?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<string[]>(product.image ? [product.image] : []);
  const [activeImg, setActiveImg] = useState(0);
  const [description, setDescription] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [weight, setWeight] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [stock, setStock] = useState<number | null>(null);
  const [warehouse, setWarehouse] = useState<string | null>(null);
  // Conformité "je veux TOUT voir avant d'envoyer" (Pascal 2026-06-09).
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [margin, setMargin] = useState(DEFAULT_MARKUP); // notre marge en % du coût (petite marge)
  const [shipping, setShipping] = useState<{ name: string; price: number | null; days: string | null }[]>([]);
  const [country, setCountry] = useState(defaultCountry);
  const [firstVid, setFirstVid] = useState<string>('');
  const [shipLoading, setShipLoading] = useState(false);

  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);

  const openWithProduct = useCardCreationStore((s) => s.openWithProduct);

  // Faire un POST avec cet article (le flux d'avant) : ouvre le composer préchargé.
  const postProduct = () => {
    openWithProduct({
      id: product.cardId || product.pid || '',
      title: product.title,
      image_url: (images[activeImg] || product.image) ?? null,
      price_label: displayPrice || product.price_label || null,
      currency: null,
      source: 'AliExpress',
      source_url: '',
      condition: null,
    });
    onClose();
  };

  useEffect(() => {
    let alive = true;
    const qs = product.cardId
      ? `card=${encodeURIComponent(product.cardId)}`
      : `pid=${encodeURIComponent(product.pid || '')}`;
    fetch(`/api/dropship/detail?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d.images) && d.images.length) setImages(d.images);
        setDescription(d.description ?? null);
        setColors(d.colors || []);
        setSizes(d.sizes || []);
        setStyles(d.styles || []);
        setVariants(d.variants || []);
        setWeight(d.weight ?? null);
        setCategory(d.category ?? null);
        setStock(typeof d.stock_total === 'number' ? d.stock_total : null);
        setWarehouse(d.warehouse ?? null);
        setRaw(d.raw ?? null);
        setShipping(Array.isArray(d.shipping) ? d.shipping : []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setFirstVid((d.variants || []).find((v: any) => v.vid)?.vid || '');
        setExtra({
          SKU: d.sku, 'Code HS': d.hs_code, Matière: d.material, Emballage: d.packaging,
          Catégorie: d.category, Poids: d.weight, Popularité: d.popularity,
          'Prix min ($)': d.price_min, 'Prix max ($)': d.price_max,
          Axes: Array.isArray(d.axes) ? d.axes.join(' / ') : d.axes,
          'Nb variantes': Array.isArray(d.variants) ? d.variants.length : 0,
          'Nb images': Array.isArray(d.images) ? d.images.length : 0,
        });
        if (d.colors?.[0]) setColor(d.colors[0]);
        if (d.sizes?.[0]) setSize(d.sizes[0]);
        if (d.styles?.[0]) setStyle(d.styles[0]);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [product.cardId, product.pid]);

  // Variante courante = celle dont les valeurs contiennent les sélections.
  const current = useMemo(() => {
    if (!variants.length) return null;
    const want = [color, size, style].filter(Boolean) as string[];
    return (
      variants.find((v) => {
        const vals = Object.values(v.values || {});
        return want.every((w) => vals.includes(w));
      }) || null
    );
  }, [variants, color, size, style]);

  // Image qui suit la couleur choisie (si la variante a sa propre image).
  useEffect(() => {
    if (current?.image) {
      setImages((imgs) => (imgs.includes(current.image!) ? imgs : [current.image!, ...imgs]));
      setActiveImg(0);
    }
  }, [current?.image]);

  const displayPrice = (current && priceLabel(current.cost, margin)) || product.price_label;

  // Recharge les délais d'acheminement quand on change de pays de destination.
  useEffect(() => {
    if (!firstVid) return;
    let alive = true;
    setShipLoading(true);
    fetch(`/api/dropship/freight?vid=${encodeURIComponent(firstVid)}&country=${country}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) setShipping(Array.isArray(d.shipping) ? d.shipping : []); })
      .catch(() => {})
      .finally(() => { if (alive) setShipLoading(false); });
    return () => { alive = false; };
  }, [country, firstVid]);

  const Chips = ({ label, items, value, set }: { label: string; items: string[]; value: string | null; set: (v: string) => void }) =>
    items.length === 0 ? null : (
      <div>
        <p className="text-[12px] text-white/50 mb-1.5">{label}</p>
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button
              key={it}
              onClick={() => set(it)}
              className={
                'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ' +
                (value === it ? 'bg-red-500/25 text-red-100 border-red-400/50' : 'bg-white/[0.06] text-white/80 border-white/12 hover:border-white/25')
              }
            >
              {it}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-[#0e0e12] rounded-t-3xl sm:rounded-3xl border-t border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full aspect-square bg-white/[0.04]">
          {images[activeImg] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[activeImg]} alt={product.title} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full grid place-items-center text-white/20 text-5xl">🛍️</div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-black/55 text-white hover:bg-black/75" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 px-4 pt-3 overflow-x-auto">
            {images.map((im, i) => (
              <button key={i} onClick={() => setActiveImg(i)} className={'w-14 h-14 rounded-lg overflow-hidden shrink-0 border ' + (i === activeImg ? 'border-red-400' : 'border-white/10')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="p-4 space-y-3.5">
          <h2 className="text-[16px] font-semibold text-white leading-snug">{product.title}</h2>
          <p className="text-[20px] font-bold text-white">{displayPrice}</p>

          {stock != null && (
            <div className="flex items-center gap-2 text-[12px]">
              <span className={'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium ' + (stock > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>
                <span className={'w-1.5 h-1.5 rounded-full ' + (stock > 0 ? 'bg-emerald-400' : 'bg-rose-400')} />
                {stock > 0 ? `En stock · ${stock.toLocaleString('fr-FR')} dispo` : 'Rupture'}
              </span>
              {warehouse && <span className="text-white/45">Entrepôt : {warehouse}</span>}
            </div>
          )}

          {loading && <div className="flex items-center gap-2 text-white/40 text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Extraction des variantes + délais…</div>}

          {/* TRANSPORTEURS + DÉLAIS → pays (Pascal 2026-06-09, explicité 2026-06-20) */}
          {!loading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[12px] text-white/70 font-medium flex items-center gap-1.5">
                  🚚 Transporteurs vers
                  {shipLoading && <Loader2 className="w-3 h-3 animate-spin text-white/40" />}
                </p>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="bg-white/[0.06] border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white outline-none focus:border-red-400/50 max-w-[55%]"
                  aria-label="Pays de destination"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#0e0e12]">{c.name}</option>
                  ))}
                </select>
              </div>
              {shipping.length === 0 ? (
                <p className="text-[12px] text-white/40">{shipLoading ? 'Calcul des délais…' : 'Aucun transporteur vers ce pays pour cette variante — produit à écarter pour ce marché.'}</p>
              ) : (() => {
                // Délai mini (1er nombre de "x-y") pour trier + repérer le + rapide / le lent.
                const minDay = (d: string | null) => { const m = String(d ?? '').match(/\d+/); return m ? parseInt(m[0], 10) : 9999; };
                const sorted = [...shipping].sort((a, b) => minDay(a.days) - minDay(b.days));
                const fastest = minDay(sorted[0]?.days);
                return (
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-white/35 pb-1 border-b border-white/10">
                      <span className="flex-1">Transporteur</span>
                      <span className="shrink-0 w-16 text-right">Délai</span>
                      <span className="shrink-0 w-14 text-right">Prix</span>
                    </div>
                    {sorted.slice(0, 7).map((s, i) => {
                      const md = minDay(s.days);
                      const slow = md >= 12;                 // Postal/Eub : à éviter
                      const best = md === fastest && !slow;  // le + rapide
                      return (
                        <div key={i} className={'flex items-center justify-between gap-2 text-[12px] border-b border-white/5 py-1 ' + (slow ? 'opacity-45' : '')}>
                          <span className="truncate flex-1 flex items-center gap-1.5">
                            {best && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold shrink-0">RAPIDE</span>}
                            <span className="text-white/85 truncate">{s.name}</span>
                          </span>
                          <span className={'font-semibold shrink-0 w-16 text-right ' + (slow ? 'text-white/50' : 'text-emerald-200')}>{s.days ? `${s.days} j` : '—'}</span>
                          <span className="text-white/50 shrink-0 w-14 text-right">{s.price != null ? `${s.price} $` : ''}</span>
                        </div>
                      );
                    })}
                    {country === 'FR' && (() => {
                      // Total estimé jusqu'à Antananarivo = port CJ (Chine→Paris, ligne rapide) × facteur.
                      const fastRef = sorted.find((s) => minDay(s.days) < 12) || sorted[0];
                      const cj = fastRef?.price ?? null;
                      const tana = cj != null ? Math.round(cj * PARIS_TANA_MULT * 100) / 100 : null;
                      if (tana == null) return null;
                      return (
                        <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-amber-100 font-medium">🇲🇬 Total estimé jusqu'à Antananarivo</span>
                            <span className="text-[13px] font-bold text-amber-200">≈ {tana} $</span>
                          </div>
                          <p className="text-[10px] text-amber-200/60 mt-0.5">Chine→Paris ({cj} $) + Paris→Tana estimé identique. À ajuster avec le vrai tarif.</p>
                        </div>
                      );
                    })()}
                    <p className="text-[10px] text-white/35 mt-1.5">Grisé = trop lent (12 j+). Vert = livraison la plus rapide.</p>
                  </div>
                );
              })()}
            </div>
          )}

          <Chips label="Couleur" items={colors} value={color} set={setColor} />
          <Chips label="Taille" items={sizes} value={size} set={setSize} />
          <Chips label="Style" items={styles} value={style} set={setStyle} />

          {/* MARGE + TABLEAU PRIX PAR VARIANTE (Pascal 2026-06-09) */}
          {variants.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-white/60">Notre marge</span>
                <div className="flex items-center gap-1.5">
                  {[10, 15, 20, 30].map((m) => (
                    <button key={m} onClick={() => setMargin(m)}
                      className={'px-2 py-1 rounded-lg text-[11px] font-semibold border ' + (Math.abs(margin - m) < 0.001 ? 'bg-red-500/20 border-red-400/40 text-red-100' : 'border-white/12 text-white/55')}>
                      +{m}%
                    </button>
                  ))}
                  <div className="flex items-center bg-white/[0.06] border border-white/12 rounded-lg focus-within:border-red-400/50">
                    <input type="number" step="1" min="0" value={margin}
                      onChange={(e) => setMargin(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-11 bg-transparent px-2 py-1 text-[12px] text-white outline-none" />
                    <span className="text-white/40 text-[12px] pr-2">%</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-white/40 text-left">
                      <th className="font-medium pb-1 pl-1">Variante</th>
                      <th className="font-medium pb-1 text-right">Coût</th>
                      <th className="font-medium pb-1 text-right">Marge</th>
                      <th className="font-medium pb-1 text-right pr-1">Prix de vente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => {
                      const label = Object.values(v.values).filter(Boolean).join(' / ') || v.sku || `Variante ${i + 1}`;
                      const sell = sellPrice(v.cost, margin);
                      const profit = sell != null && v.cost != null ? Math.round((sell - v.cost) * 10) / 10 : null;
                      return (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1 pl-1 text-white/85 truncate max-w-[120px]">{label}</td>
                          <td className="py-1 text-right text-white/55">{v.cost != null ? `${v.cost} $` : '—'}</td>
                          <td className="py-1 text-right text-emerald-300/80">{profit != null ? `+${profit} €` : '—'}</td>
                          <td className="py-1 pr-1 text-right font-bold text-white">{sell != null ? `${sell} €` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-white/35">Prix de vente = coût + {margin}% de marge (hors transport). Ajuste la marge, le tableau se met à jour.</p>
            </div>
          )}

          {description && (
            <div>
              <p className="text-[12px] text-white/50 mb-1">Description</p>
              <p className="text-[13px] text-white/70 leading-relaxed">{description}</p>
            </div>
          )}

          {/* INFOS COMPLÈTES — tout ce que renvoie l'API, avant d'envoyer (Pascal). */}
          <div className="pt-1">
            <p className="text-[12px] text-white/50 mb-1.5">Détails complets (API)</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {Object.entries(extra)
                .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== 0)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-white/5 py-0.5">
                    <span className="text-white/40 shrink-0">{k}</span>
                    <span className="text-white/75 text-right truncate">{String(v)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* JSON BRUT — pour TOUT voir, sans filtre */}
          {raw && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="w-full text-left text-[12px] text-red-300 font-medium py-1.5"
              >
                {showRaw ? '▾' : '▸'} Voir toutes les données brutes (API CJ)
              </button>
              {showRaw && (
                <pre className="text-[10px] leading-relaxed text-white/70 bg-black/50 border border-white/10 rounded-xl p-2.5 overflow-auto max-h-72 whitespace-pre-wrap break-all">
                  {JSON.stringify(raw, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-1">
            <button onClick={postProduct} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/[0.08] border border-white/15 font-semibold text-[14px] active:scale-[0.99]">
              <Send className="w-4 h-4" /> Publier ce produit
            </button>
            <button className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold text-[15px] active:scale-[0.99]">
              Commander
            </button>
          </div>
          <p className="text-[11px] text-white/35 text-center">Publie cet article en post · expédié par le fournisseur</p>
        </div>
      </div>
    </div>
  );
}
