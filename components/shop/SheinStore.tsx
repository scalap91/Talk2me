'use client';

/**
 * Talk2Me — Shop Storefront style SHEIN (thème CLAIR).
 * Assemble : SheinSearchBar (sticky) + onglets décoratifs + SheinHero
 * + bandeau info + CategoryCircles + sections produits (grille 2 colonnes).
 * Fetch GET /api/shop/store au montage. Tap produit -> ProductDetailSheet.
 * Tap cercle -> scroll fluide vers la section de la catégorie.
 *
 * Thème clair forcé (fond #fafafa), accents violet — ne PAS hériter du dark global.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Truck, Gift, Heart, ImageOff } from 'lucide-react';
import SheinSearchBar from '@/components/shop/SheinSearchBar';
import SheinHero from '@/components/shop/SheinHero';
import CategoryCircles from '@/components/shop/CategoryCircles';
import ProductDetailSheet, {
  type SheetProduct,
} from '@/components/boutique/ProductDetailSheet';

interface ApiProduct {
  id: string;
  title: string;
  image: string | null;
  price_label: string | null;
}

interface ApiCategory {
  category: string;
  products: ApiProduct[];
}

const TABS = ['Tout', 'Femme', 'Enfants', 'Homme'];

/** Slug stable pour les ancres de scroll (déterministe, ASCII-safe). */
function slugify(s: string): string {
  return (
    'cat-' +
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  );
}

export default function SheinStore({ onBack, embedded }: { onBack?: () => void; embedded?: boolean } = {}) {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [open, setOpen] = useState<ApiProduct | null>(null);

  // Refs d'ancrage : slug -> wrapper de section
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/shop/store', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data?.ok || !Array.isArray(data.categories)) {
          setError(true);
          setCategories([]);
        } else {
          setCategories(
            (data.categories as ApiCategory[]).filter(
              (c) => c && Array.isArray(c.products) && c.products.length > 0,
            ),
          );
        }
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const circleCats = useMemo(
    () =>
      categories.map((c) => ({
        name: c.category,
        image: c.products[0]?.image ?? null,
      })),
    [categories],
  );

  function handlePick(name: string) {
    const el = sectionRefs.current[slugify(name)];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    // Embarqué dans « Acheter » (wrapper overflow-hidden) → la boutique doit
    // être SON PROPRE conteneur de scroll. En plein écran, on garde min-h.
    <div className={`w-full bg-white text-neutral-900 ${embedded ? 'h-full overflow-y-auto' : 'min-h-[100svh]'}`}>
      {/* 1. Barre de recherche sticky (avec retour vers l'app) */}
      <SheinSearchBar value={search} onChange={setSearch} onSubmit={() => {}} onBack={embedded ? undefined : onBack} />

      {/* Bloc « Ma boutique » retiré du shop (Pascal 2026-06-14 : n'a rien à faire ici) */}

      {/* 2. Onglets horizontaux (décoratifs) */}
      <div className="flex gap-5 px-3 overflow-x-auto no-scrollbar">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(i)}
            className={
              'py-2 text-sm whitespace-nowrap border-b-2 transition-colors ' +
              (i === activeTab
                ? 'font-bold text-neutral-900 border-red-500'
                : 'text-neutral-500 border-transparent')
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 3. HERO carrousel */}
      <div className="mt-3">
        <SheinHero />
      </div>

      {/* 4. Bandeau info */}
      <div className="grid grid-cols-2 gap-2 px-3 mt-3">
        <div className="bg-white rounded-xl border border-neutral-200 px-3 py-2 flex items-center gap-2">
          <Truck className="h-5 w-5 shrink-0 text-red-500" />
          <div className="text-xs leading-tight">
            <div className="font-semibold text-neutral-800">Livraison gratuite</div>
            <div className="text-neutral-500">Dès aujourd&apos;hui</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 px-3 py-2 flex items-center gap-2">
          <Gift className="h-5 w-5 shrink-0 text-red-500" />
          <div className="text-xs leading-tight">
            <div className="font-semibold text-neutral-800">Cartes-cadeaux</div>
            <div className="text-neutral-500">À offrir</div>
          </div>
        </div>
      </div>

      {/* 5. Cercles de catégories */}
      {circleCats.length > 0 && (
        <CategoryCircles categories={circleCats} onPick={handlePick} />
      )}

      {/* 6. Sections produits / états */}
      {loading ? (
        <div className="mt-6 px-3">
          <div className="h-4 w-32 bg-neutral-200 animate-pulse rounded mb-3" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-neutral-200 animate-pulse rounded-xl aspect-square"
              />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="mt-10 px-3 text-center text-sm text-neutral-500">
          Boutique momentanément indisponible.
        </div>
      ) : categories.length === 0 ? null : (
        <div className="pb-10">
          {categories.map((cat) => {
            const slug = slugify(cat.category);
            return (
              <section
                key={slug}
                id={slug}
                ref={(el) => {
                  sectionRefs.current[slug] = el;
                }}
                className="scroll-mt-16"
              >
                <div className="flex items-center justify-between px-3 mt-6 mb-3">
                  <h2 className="text-base font-bold text-neutral-900">
                    {cat.category}
                  </h2>
                  <span className="text-xs text-red-500">Voir tout</span>
                </div>

                <div className="grid grid-cols-2 gap-2 px-3">
                  {cat.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOpen(p)}
                      className="bg-white rounded-xl overflow-hidden border border-neutral-200 text-left"
                    >
                      <div className="relative aspect-square bg-neutral-100">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image}
                            alt={p.title}
                            loading="lazy"
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageOff className="h-8 w-8 text-neutral-300" />
                          </div>
                        )}
                        <span className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-white/80 flex items-center justify-center">
                          <Heart className="h-4 w-4 text-neutral-500" />
                        </span>
                      </div>
                      <div className="p-2">
                        <div className="text-xs text-neutral-700 leading-tight line-clamp-2">
                          {p.title}
                        </div>
                        {p.price_label ? (
                          <div className="text-sm font-bold text-red-600 mt-1">
                            {p.price_label}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Fiche produit */}
      {open && (
        <ProductDetailSheet
          product={{
            cardId: open.id,
            title: open.title,
            image: open.image,
            price_label: open.price_label ?? '',
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
