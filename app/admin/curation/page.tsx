'use client';

/**
 * Talk2Me — SÉLECTEUR DE PRODUITS (#25, Pascal 2026-06-08).
 * Tu parcours les produits de toutes les catégories, tu vois la fiche (tap),
 * tu COCHES ceux que tu veux, et tu PUBLIES la sélection dans une boutique.
 * Curation PAR L'HUMAIN. Dark premium.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, Check, Loader2, Eye, ShoppingBag } from 'lucide-react';
import ProductDetailSheet, { type SheetProduct } from '@/components/boutique/ProductDetailSheet';
import { COUNTRIES } from '@/lib/countries';

interface BrowseProduct { pid: string; name: string; image: string; cost: number | null; suggested: string }
interface Cat { label: string; theme: string; emoji: string; categoryId?: string; query: string }

export default function CurationPage({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [activeCat, setActiveCat] = useState<Cat | null>(null);
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, BrowseProduct>>({});
  const [preview, setPreview] = useState<SheetProduct | null>(null);
  const [name, setName] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState<{ slug: string; count: number } | null>(null);
  const [proposed, setProposed] = useState(false);
  // Rôle : un VALIDATEUR/admin publie direct ; un REGARDEUR propose à la validation.
  const [canValidate, setCanValidate] = useState(false);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const u = d?.user; if (u) setCanValidate(!!u.is_admin || (Array.isArray(u.permissions) && u.permissions.includes('curation_validateur')));
    }).catch(() => {});
  }, []);
  // Filtre "livre à [pays]" (Pascal 2026-06-09)
  const [destCountry, setDestCountry] = useState('FR');
  const [shipMap, setShipMap] = useState<Record<string, boolean>>({});
  const [filterOn, setFilterOn] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [filterInfo, setFilterInfo] = useState<{ ok: number; checked: number; total: number } | null>(null);

  // Charger les catégories navigables.
  useEffect(() => {
    fetch('/api/dropship/browse', { cache: 'no-store' })
      .then((r) => (r.status === 401 ? router.push('/signin') : r.json()))
      .then((d) => { if (d?.categories) { setCats(d.categories); if (d.categories[0]) loadCat(d.categories[0]); } })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (cat: Cat | null, query: string, pageNum: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    const params = new URLSearchParams();
    params.set('size', '96');
    params.set('page', String(pageNum));
    if (query) params.set('q', query);
    else if (cat?.categoryId) params.set('categoryId', cat.categoryId);
    else if (cat) params.set('q', cat.query);
    const r = await fetch(`/api/dropship/browse?${params}`, { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      setProducts((prev) => (append ? [...prev, ...(d.products || [])] : d.products || []));
      setHasMore(!!d.hasMore);
      setPage(pageNum);
    }
    append ? setLoadingMore(false) : setLoading(false);
  }, []);

  const loadCat = (c: Cat) => { setActiveCat(c); setQ(''); setLastQuery(''); load(c, '', 1, false); };
  const search = () => { if (q.trim()) { setActiveCat(null); setLastQuery(q.trim()); load(null, q.trim(), 1, false); } };
  const loadMore = () => load(activeCat, lastQuery, page + 1, true);

  const toggle = (p: BrowseProduct) =>
    setSelected((s) => { const n = { ...s }; if (n[p.pid]) delete n[p.pid]; else n[p.pid] = p; return n; });

  const selCount = Object.keys(selected).length;

  // Filtre "livre à [pays]" : vérifie les produits AFFICHÉS via l'API logistique CJ.
  const runShipFilter = async () => {
    setFiltering(true);
    try {
      const pids = products.map((p) => p.pid);
      const r = await fetch('/api/dropship/ships-to', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pids, country: destCountry }),
      });
      const d = await r.json();
      if (d?.ok) {
        const map = d.results || {};
        setShipMap(map);
        setFilterOn(true);
        const ok = Object.values(map).filter(Boolean).length;
        setFilterInfo({ ok, checked: d.checked, total: d.total });
      }
    } finally {
      setFiltering(false);
    }
  };
  const clearShipFilter = () => { setFilterOn(false); setFilterInfo(null); };

  // Produits visibles selon le filtre.
  const visibleProducts = filterOn ? products.filter((p) => shipMap[p.pid]) : products;

  const publish = async () => {
    if (selCount === 0) return;
    setPublishing(true);
    try {
      if (canValidate) {
        // Validateur/admin → publie directement.
        const r = await fetch('/api/dropship/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() || 'Ma sélection', items: Object.values(selected) }),
        });
        if (r.ok) { const d = await r.json(); setDone({ slug: d.slug, count: d.count }); setSelected({}); }
      } else {
        // Regardeur → propose à la validation (file d'attente).
        const r = await fetch('/api/curation/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() || 'Ma sélection', items: Object.values(selected) }),
        });
        if (r.ok) { setProposed(true); setSelected({}); }
      }
    } finally { setPublishing(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0d] text-white max-w-md mx-auto pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-2 h-14 px-3 border-b border-white/8 bg-[#0a0a0d]/90 backdrop-blur-xl">
        <button onClick={() => (onBack ? onBack() : router.push('/home'))} className="p-1 text-white/60 hover:text-white"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Sélecteur de produits</h1>
      </header>

      {/* Recherche */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Rechercher un produit…" className="flex-1 bg-transparent text-[14px] outline-none placeholder-white/30" />
        </div>
      </div>

      {/* Catégories */}
      <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
        {cats.map((c) => (
          <button key={c.label} onClick={() => loadCat(c)}
            className={'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ' +
              (activeCat?.label === c.label ? 'bg-red-500/25 text-red-100 border-red-400/50' : 'bg-white/[0.05] text-white/70 border-white/10')}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Filtre : livre à [pays] */}
      <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
        <span className="text-[12px] text-white/50">Livraison vers</span>
        <select
          value={destCountry}
          onChange={(e) => { setDestCountry(e.target.value); clearShipFilter(); }}
          className="bg-white/[0.06] border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white outline-none focus:border-red-400/50"
        >
          {COUNTRIES.map((c) => <option key={c.code} value={c.code} className="bg-[#0a0a0d]">{c.name}</option>)}
        </select>
        {!filterOn ? (
          <button onClick={runShipFilter} disabled={filtering}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-50">
            {filtering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Filtrer les livrables
          </button>
        ) : (
          <button onClick={clearShipFilter} className="px-3 py-1 rounded-full text-[12px] font-semibold bg-white/10 border border-white/15">
            ✕ Filtre actif
          </button>
        )}
        {filterInfo && (
          <span className="text-[11px] text-white/45">{filterInfo.ok} livrables / {filterInfo.checked} vérifiés{filterInfo.total > filterInfo.checked ? ` (sur ${filterInfo.total})` : ''}</span>
        )}
      </div>

      {/* Grille produits */}
      {loading ? (
        <div className="py-16 text-center text-white/40"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : (
        <>
          {products.length > 0 && (
            <p className="px-3 text-[11px] text-white/40 mb-1">
              {visibleProducts.length} produits{filterOn ? ` livrables (${COUNTRIES.find((c) => c.code === destCountry)?.name || destCountry})` : ''}
            </p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5 px-2">
            {visibleProducts.map((p) => {
              const on = !!selected[p.pid];
              return (
                <div key={p.pid} className={'relative rounded-xl border overflow-hidden bg-white/[0.03] ' + (on ? 'border-red-400 ring-1 ring-red-400/50' : 'border-white/10')}>
                  {/* Clic sur l'image → ouvre la fiche (description). */}
                  <button onClick={() => setPreview({ pid: p.pid, title: p.name, image: p.image, price_label: p.suggested })} className="block w-full">
                    <div className="relative w-full aspect-square bg-white/[0.04]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.name} className="w-full h-full object-contain" />
                    </div>
                  </button>
                  {/* Pastille = sélection (cocher pour la boutique), sans ouvrir la fiche. */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(p); }}
                    aria-label={on ? 'Retirer de la sélection' : 'Ajouter à la sélection'}
                    className={'absolute top-1.5 left-1.5 w-6 h-6 rounded-full grid place-items-center border ' + (on ? 'bg-red-500 border-red-400' : 'bg-black/55 border-white/40')}>
                    {on && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <div className="px-1.5 pb-1.5 pt-1">
                    <p className="text-[10px] text-white/75 line-clamp-1 leading-tight">{p.name}</p>
                    {p.suggested && <p className="text-[11px] font-bold">{p.suggested}</p>}
                  </div>
                </div>
              );
            })}
            {visibleProducts.length === 0 && <p className="col-span-full py-16 text-center text-[13px] text-white/40">{filterOn ? 'Aucun produit livrable vers ce pays (parmi ceux vérifiés).' : 'Choisis une catégorie ou recherche un produit.'}</p>}
          </div>
          {hasMore && products.length < 1000 && (
            <div className="px-3 py-4">
              <button onClick={loadMore} disabled={loadingMore}
                className="w-full py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-[13px] font-medium text-white/80 hover:bg-white/[0.10] disabled:opacity-60 flex items-center justify-center gap-2">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Charger plus de produits
              </button>
            </div>
          )}
        </>
      )}

      {/* Barre de sélection / publication */}
      {selCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 max-w-md mx-auto bg-[#0e0e12]/95 backdrop-blur-xl border-t border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-red-300">{selCount} sélectionné{selCount > 1 ? 's' : ''}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la boutique"
              className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none placeholder-white/30" />
          </div>
          <button onClick={publish} disabled={publishing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold text-[15px] disabled:opacity-60">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
            {canValidate ? 'Publier dans la boutique' : 'Proposer à la validation'}
          </button>
        </div>
      )}

      {/* Succès */}
      {done && (
        <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-6" onClick={() => setDone(null)}>
          <div className="bg-[#0e0e12] border border-white/10 rounded-3xl p-6 text-center max-w-xs" onClick={(e) => e.stopPropagation()}>
            <p className="text-[16px] font-bold">Publié 🎉</p>
            <p className="text-[13px] text-white/60 mt-1">{done.count} produit{done.count > 1 ? 's' : ''} ajouté{done.count > 1 ? 's' : ''}.</p>
            <button onClick={() => router.push('/' + done.slug)} className="mt-4 w-full py-2.5 rounded-xl bg-red-600 font-semibold text-[14px]">Voir la boutique</button>
            <button onClick={() => setDone(null)} className="mt-2 w-full py-2 text-[13px] text-white/50">Continuer à sélectionner</button>
          </div>
        </div>
      )}

      {/* Proposé (regardeur) — en attente de validation */}
      {proposed && (
        <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-6" onClick={() => setProposed(false)}>
          <div className="bg-[#0e0e12] border border-white/10 rounded-3xl p-6 text-center max-w-xs" onClick={(e) => e.stopPropagation()}>
            <p className="text-[16px] font-bold">Proposé ✅</p>
            <p className="text-[13px] text-white/60 mt-1">Ta sélection part en validation. Tu seras prévenu quand elle est publiée.</p>
            <button onClick={() => setProposed(false)} className="mt-4 w-full py-2.5 rounded-xl bg-red-600 font-semibold text-[14px]">Continuer</button>
          </div>
        </div>
      )}

      {preview && <ProductDetailSheet product={preview} defaultCountry={destCountry} onClose={() => setPreview(null)} />}
    </div>
  );
}
