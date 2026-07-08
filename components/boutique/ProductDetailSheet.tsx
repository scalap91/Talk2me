'use client';

/**
 * Talk2Me — Fiche produit COMPLÈTE (#25) ouverte DANS la boutique.
 * Extrait TOUT (pas juste desc+photo) : galerie, couleurs, tailles, styles,
 * prix/image par variante, description FR, poids/catégorie. Le prix et l'image
 * s'ajustent selon la variante choisie (couleur + taille).
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Send } from '@/lib/icons';
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
  const [, setRaw] = useState<any>(null);
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
        <p className="text-[12px] text-[var(--t2m-ink-3)] mb-1.5">{label}</p>
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button
              key={it}
              onClick={() => set(it)}
              className={
                'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ' +
                (value === it ? 'bg-red-500/25 text-red-100 border-red-400/50' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)] hover:border-[var(--t2m-line)]')
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
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-[var(--t2m-paper)] rounded-t-3xl sm:rounded-3xl border-t border-[var(--t2m-line)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full aspect-square bg-[var(--t2m-wash)]">
          {/* badge card — principe : c'est une card, pas un dump d'API */}
          <span className="absolute top-3 left-3 z-10 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-fuchsia-600 text-white shadow">card</span>
          {images[activeImg] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[activeImg]} alt={product.title} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full grid place-items-center text-[var(--t2m-ink-3)] text-5xl">🛍️</div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-black/55 text-white hover:bg-black/75" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CARD PRODUIT — infos propres SÉLECTIONNÉES (pas l'API brute) :
            badge card · 1 photo · description · couleur · taille · Publier · Commander. */}
        <div className="p-4 space-y-4">
          <h2 className="text-[16px] font-semibold text-[var(--t2m-ink)] leading-snug">{product.title}</h2>

          {description && (
            <div>
              <p className="text-[12px] text-[var(--t2m-ink-3)] mb-1">Description</p>
              <p className="text-[13px] text-[var(--t2m-ink-2)] leading-relaxed">{description}</p>
            </div>
          )}

          <Chips label="Couleur" items={colors} value={color} set={setColor} />
          <Chips label="Taille" items={sizes} value={size} set={setSize} />

          <div className="flex gap-2 mt-1">
            <button onClick={postProduct} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] font-semibold text-[14px] active:scale-[0.99]">
              <Send className="w-4 h-4" /> Publier
            </button>
            <button className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-[15px] active:scale-[0.99]">
              Commander
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
