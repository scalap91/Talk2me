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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SuperCardView from '@/components/cards/SuperCardView';
import { fromStoreProduct } from '@/lib/cards/adapt';
import { READERS } from '@/lib/cards/readers';
import { Search, Truck, Gift, Heart, ImageOff, Plus, Loader2, ArrowLeft } from '@/lib/icons';
import SheinSearchBar from '@/components/shop/SheinSearchBar';
import SheinHero from '@/components/shop/SheinHero';
import CategoryCircles from '@/components/shop/CategoryCircles';
import ProductDetailSheet, {
  type SheetProduct,
} from '@/components/boutique/ProductDetailSheet';
import CurationBrowser from '@/app/admin/curation/page';

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

// Filtre par audience : chaque onglet montre un sous-ensemble de catégories.
const TAB_CATS: Record<string, string[] | null> = {
  Tout: null,
  Femme: ['Vêtements pour femmes', 'Vêtements et accessoires', 'Sous-vêtements', 'Bijoux et accessoires', 'Montres', 'Baggages et sacs', 'Beauté et santé', 'Extensions de cheveux et perruques', 'Accessoires pour vêtements', 'Chaussures', 'Mariages et événements'],
  Enfants: ['Mère et enfants', 'Jouets et loisirs'],
  Homme: ['Vêtements pour hommes', 'Montres', 'Chaussures', 'Sports et loisirs', 'Outils', 'Automobiles, pièces et accessoires', 'Téléphones et télécommunications', 'Accessoires pour téléphones et télécommunications'],
};

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
  const [reloadN, setReloadN] = useState(0);

  // Mode d'affichage boutique, posé serveur sur <html data-d-boutique="cards|photo">.
  // Défaut « cards » (grille de SuperCards). « photo » = mosaïque jointive plein cadre.
  const [mode, setMode] = useState<'cards' | 'photo'>('cards');
  useEffect(() => {
    const read = () =>
      setMode(document.documentElement.dataset.dBoutique === 'photo' ? 'photo' : 'cards');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  // Admin : ajout de produits AliExpress dans la Boutique générale (Pascal 2026-06-28).
  const [isAdmin, setIsAdmin] = useState(false);
  // Admin : catalogue BRUT (navigateur fournisseur : catégories → articles bruts →
  // fiche brute → flèche retour). Pascal 2026-06-29.
  const [showCatalog, setShowCatalog] = useState(false);
  const [aeOpen, setAeOpen] = useState(false);
  const [aeQuery, setAeQuery] = useState('');
  const [aeResults, setAeResults] = useState<Array<{ id: string; title: string; image_url: string | null; price_label: string | null; ae_cat_path?: string | null }>>([]);
  const [aeLoading, setAeLoading] = useState(false);
  const [aeSearched, setAeSearched] = useState(false);
  const [aeAddingId, setAeAddingId] = useState<string | null>(null);
  const [aeAddedIds, setAeAddedIds] = useState<Set<string>>(new Set());

  // Mode admin = interrupteur « Mode admin » du profil (localStorage t2m_admin_mode).
  const [adminMode, setAdminMode] = useState(false);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setIsAdmin(!!d?.user?.is_admin_capable)).catch(() => {});
    try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ }
  }, []);

  // Bulles de catégories = catégories AliExpress (avec image représentative).
  const [aeCats, setAeCats] = useState<{ name: string; image: string | null }[]>([]);
  useEffect(() => {
    fetch('/api/shop/ae-categories', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.categories)) setAeCats(d.categories.map((c: { name: string; image: string | null }) => ({ name: c.name, image: c.image ?? null }))); })
      .catch(() => {});
  }, []);

  const aeSearch = useCallback(async () => {
    const q = aeQuery.trim();
    if (q.length < 2) return;
    setAeLoading(true); setAeSearched(true);
    try {
      const r = await fetch(`/api/search/product?query=${encodeURIComponent(q)}&limit=20`, { cache: 'no-store' });
      const d = await r.json();
      setAeResults(Array.isArray(d.products) ? d.products : []);
    } catch { setAeResults([]); } finally { setAeLoading(false); }
  }, [aeQuery]);

  const aeAdd = useCallback(async (p: { id: string; ae_cat_path?: string | null }) => {
    setAeAddingId(p.id);
    try {
      // Catégorie = la vraie catégorie AliExpress du produit (résolue côté serveur).
      const r = await fetch('/api/shop/store/import-ae', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: p.id, cat_path: p.ae_cat_path || null }),
      });
      if (r.ok) { setAeAddedIds((s) => new Set(s).add(p.id)); setReloadN((n) => n + 1); }
    } finally { setAeAddingId(null); }
  }, []);

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
  }, [reloadN]);

  const circleCats = useMemo(() => {
    // Image réelle d'un produit de la catégorie si dispo, sinon image AliExpress représentative.
    const imgByCat = new Map(categories.map((c) => [c.category, c.products[0]?.image ?? null]));
    if (aeCats.length) {
      return aeCats.map((c) => ({ name: c.name, image: imgByCat.get(c.name) || c.image }));
    }
    return categories.map((c) => ({ name: c.category, image: c.products[0]?.image ?? null }));
  }, [aeCats, categories]);

  // Catégories AFFICHÉES = filtre onglet (Tout/Femme/Enfants/Homme) + recherche live.
  const shown = useMemo(() => {
    const allow = TAB_CATS[TABS[activeTab]] ?? null;
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => !allow || allow.includes(c.category))
      .map((c) => ({ ...c, products: q ? c.products.filter((p) => (p.title || '').toLowerCase().includes(q)) : c.products }))
      .filter((c) => c.products.length > 0);
  }, [categories, activeTab, search]);

  function handlePick(name: string) {
    const el = sectionRefs.current[slugify(name)];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Catégorie choisie depuis la page Shop · Catégories (sessionStorage) → on
  // scrolle vers sa section une fois la boutique chargée, puis on l'efface.
  const didJumpRef = useRef(false);
  useEffect(() => {
    if (didJumpRef.current || categories.length === 0) return;
    let target: string | null = null;
    try { target = sessionStorage.getItem('t2m_shop_category'); } catch { /* */ }
    if (!target) return;
    try { sessionStorage.removeItem('t2m_shop_category'); } catch { /* */ }
    didJumpRef.current = true;
    // laisse le DOM des sections se monter avant de scroller
    requestAnimationFrame(() => handlePick(target as string));
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // Embarqué dans « Acheter » (wrapper overflow-hidden) → la boutique doit
    // être SON PROPRE conteneur de scroll. En plein écran, on garde min-h.
    <div className={`w-full bg-white text-neutral-900 ${embedded ? 'h-full overflow-y-auto' : 'min-h-[100svh]'}`}>
      {/* 1. Barre de recherche sticky (avec retour vers l'app) */}
      <SheinSearchBar value={search} onChange={setSearch} onSubmit={() => {}} onBack={embedded ? undefined : onBack} />

      {/* Bloc « Ma boutique » retiré du shop (Pascal 2026-06-14 : n'a rien à faire ici) */}

      {/* ADMIN : visibles UNIQUEMENT quand le « Mode admin » est activé (profil). Pascal 2026-06-29 */}
      {isAdmin && adminMode && (
        <div className="px-3 mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowCatalog(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold active:scale-[0.99]"
          >
            <Search className="h-4 w-4 text-amber-400" /> Catalogue brut
          </button>
          <button
            type="button"
            onClick={() => setAeOpen(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-800 text-sm font-semibold active:scale-[0.99]"
          >
            <Plus className="h-4 w-4 text-neutral-700" /> Ajout rapide
          </button>
        </div>
      )}

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
      ) : categories.length === 0 ? null : shown.length === 0 ? (
        <div className="mt-10 px-3 text-center text-sm text-neutral-500">
          {search.trim() ? `Aucun produit pour « ${search.trim()} ».` : 'Aucun produit dans cette sélection.'}
        </div>
      ) : (
        <div className="pb-10">
          {shown.map((cat) => {
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

                {mode === 'photo' ? (
                  // Mode PHOTO : mosaïque JOINTIVE — 2 colonnes bord à bord, tuiles
                  // carrées, nom + prix écrits SUR la photo. Tap → ProductDetailSheet.
                  <div className="grid grid-cols-2" style={{ gap: 0 }}>
                    {cat.products.map((p) => (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpen(p)}
                        className="relative cursor-pointer overflow-hidden bg-neutral-100"
                        style={{ aspectRatio: '1 / 1', borderRadius: 0 }}
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image}
                            alt={p.title}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-neutral-300">
                            <ImageOff className="h-8 w-8" />
                          </div>
                        )}
                        {/* Voile + nom/prix en bas, sur la photo. */}
                        <div
                          className="absolute inset-x-0 bottom-0 p-2"
                          style={{
                            background:
                              'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0) 55%)',
                          }}
                        >
                          <div
                            className="text-[12px] leading-tight text-white line-clamp-2"
                            style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}
                          >
                            {p.title}
                          </div>
                          {p.price_label && (
                            <div
                              className="mt-0.5 text-[13px] font-bold text-white"
                              style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}
                            >
                              {p.price_label}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 px-3">
                    {cat.products.map((p) => (
                      // CHAQUE PRODUIT = une SuperCard, lue par le LECTEUR Boutique (variante produit).
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpen(p)}
                        className="cursor-pointer"
                      >
                        <SuperCardView
                          card={fromStoreProduct({ id: p.id, title: p.title, image: p.image, price_label: p.price_label, category: cat.category })}
                          variant={READERS.boutique.variant}
                          reveal={READERS.boutique.reveal}
                          actions={READERS.boutique.actions}
                          theme="light"
                        />
                      </div>
                    ))}
                  </div>
                )}
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

      {/* ADMIN — recherche AliExpress → ajout direct dans la Boutique générale */}
      {aeOpen && (
        <div className="fixed inset-0 z-[60] bg-white text-neutral-900 flex flex-col">
          <header className="sticky top-0 flex h-14 items-center gap-2 border-b border-neutral-200 px-3 bg-white">
            <button onClick={() => setAeOpen(false)} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-neutral-600"><ArrowLeft size={18} /></button>
            <div className="text-[15px] font-semibold">Ajouter depuis AliExpress</div>
          </header>
          <div className="p-3 flex gap-2">
            <input
              value={aeQuery}
              onChange={(e) => setAeQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') aeSearch(); }}
              autoFocus
              placeholder="Cherche un produit (robe, casque, montre…)"
              className="flex-1 bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-red-400"
            />
            <button onClick={aeSearch} disabled={aeLoading || aeQuery.trim().length < 2} className="px-4 rounded-lg bg-red-600 text-white text-[14px] font-semibold disabled:opacity-40">
              {aeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Chercher'}
            </button>
          </div>
          <p className="px-3 pb-1 text-[11.5px] text-neutral-400">Chaque produit est rangé automatiquement dans sa catégorie AliExpress.</p>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {aeLoading ? (
              <div className="text-center text-neutral-400 py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : aeResults.length === 0 ? (
              <p className="text-center text-neutral-400 text-[13px] py-12">{aeSearched ? 'Aucun produit trouvé. Essaie un autre mot.' : 'Tape un mot et lance la recherche 👆'}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {aeResults.map((p) => {
                  const added = aeAddedIds.has(p.id);
                  return (
                    <div key={p.id} className="rounded-xl overflow-hidden border border-neutral-200 bg-white flex flex-col">
                      <div className="relative w-full aspect-square bg-neutral-100">
                        {p.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                        )}
                        {p.price_label && <span className="absolute bottom-1 left-1 text-[12px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">{p.price_label}</span>}
                      </div>
                      <div className="p-1.5 flex flex-col flex-1">
                        <p className="text-[10.5px] text-neutral-600 line-clamp-2 flex-1">{p.title}</p>
                        <button
                          onClick={() => aeAdd(p)}
                          disabled={aeAddingId === p.id || added}
                          className={'mt-1.5 w-full py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60 ' + (added ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-900 text-white')}
                        >
                          {aeAddingId === p.id ? '…' : added ? '✓ Ajouté' : '+ Ajouter'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN — CATALOGUE BRUT : navigateur fournisseur plein écran. Catégories →
          articles bruts → clic = fiche brute (telle que l'API l'envoie) → flèche
          retour = revient sur tout le catalogue. (Pascal 2026-06-29) */}
      {showCatalog && (
        <div className="fixed inset-0 z-[55] overflow-y-auto bg-[#0a0a0d]">
          <CurationBrowser toStore onBack={() => { setShowCatalog(false); setReloadN((n) => n + 1); }} />
        </div>
      )}
    </div>
  );
}
