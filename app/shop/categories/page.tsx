'use client';

/**
 * Talk2Me — Shop · Catégories (Pascal 2026-06-27, façon Temu). Barre Shop commune
 * mais catégories CONTEXTUELLES à la section active (Annonces / Boutiques / Plats) :
 *  - Annonces  → catégories d'annonces (réutilisées du dépôt d'annonce).
 *  - Boutiques → catégories produit boutique (mêmes bulles).
 *  - Plats     → types de cuisine.
 * La section par défaut = celle utilisée dans le Shop (sessionStorage), modifiable ici.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';
import { EAT_CATEGORIES } from '@/lib/eat-categories';

type Section = 'annonces' | 'boutiques' | 'plats';

// Annonces & Plats = listes fixes. Boutiques = catégories DYNAMIQUES de la Boutique
// principale (mêmes bulles que sa home), chargées depuis /api/shop/store.
// Plats = EAT_CATEGORIES (source unique partagée avec le formulaire resto).
const STATIC_CATS: Record<'annonces' | 'plats', readonly string[]> = {
  annonces: ['Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté', 'Loisirs', 'Services', 'Emploi', 'Immobilier', 'Autres'],
  plats: EAT_CATEGORIES,
};

export default function ShopCategoriesPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('annonces');
  const [boutiqueCats, setBoutiqueCats] = useState<{ name: string; image: string | null }[] | null>(null);

  // Section par défaut = celle active dans le Shop (mémorisée par AcheterHub).
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('t2m_shop_section');
      if (s === 'boutiques' || s === 'plats' || s === 'annonces') setSection(s);
    } catch { /* */ }
  }, []);

  // Catégories Boutiques = les catégories AliExpress (mêmes 38 bulles + images que la
  // home de la Boutique). Pascal 2026-06-28 : on adopte les catégories AliExpress.
  useEffect(() => {
    if (boutiqueCats !== null) return;
    fetch('/api/shop/ae-categories', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && Array.isArray(d.categories)) {
          setBoutiqueCats(d.categories
            .map((c: { name: string; image?: string | null }) => ({ name: c.name, image: c.image ?? null }))
            .filter((c: { name: string }) => c.name));
        } else setBoutiqueCats([]);
      })
      .catch(() => setBoutiqueCats([]));
  }, [boutiqueCats]);

  // On RESTE dans le Shop : on mémorise la section + la catégorie choisie, puis on
  // ouvre /shop. AcheterHub ouvre la bonne section et le feed applique la catégorie.
  // (Avant : push /decouvrir → ça partait dans la recherche/feed générale. Bug.)
  const go = (c: string) => {
    try {
      sessionStorage.setItem('t2m_shop_section', section);
      sessionStorage.setItem('t2m_shop_category', c);
    } catch { /* */ }
    router.push('/shop');
  };
  const boutique = section === 'boutiques'; // thème BLANC pour les catégories Boutique.

  return (
    <div className={'fixed inset-0 z-[60] flex flex-col ' + (boutique ? 'bg-white text-neutral-900' : 'bg-[#0e0e12] text-white')}>
      <ShopNav />
      <header className={'shrink-0 flex items-center gap-2 px-3 h-12 border-b ' + (boutique ? 'border-black/10' : 'border-white/8')}>
        <button onClick={() => router.push('/shop')} aria-label="Retour" className={'w-9 h-9 rounded-full grid place-items-center ' + (boutique ? 'text-neutral-700' : 'text-white/80')}><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Catégories</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:pb-6">
        {section === 'boutiques' ? (
          /* BOUTIQUE : bulles RONDES avec photo (comme la home de la Boutique). */
          boutiqueCats === null ? (
            <p className="text-center text-white/40 text-[13px] py-10">Chargement…</p>
          ) : boutiqueCats.length === 0 ? (
            <p className="text-center text-white/40 text-[13px] py-10">Aucune catégorie.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 max-w-5xl mx-auto">
              {boutiqueCats.map((c) => (
                <button key={c.name} onClick={() => go(c.name)} className="flex flex-col items-center gap-1.5 active:scale-95">
                  <span className="w-[68px] h-[68px] rounded-full overflow-hidden bg-neutral-100 border border-black/5 grid place-items-center">
                    {c.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-neutral-400 text-[18px]">🛍️</span>}
                  </span>
                  <span className="text-[12px] text-neutral-800 text-center leading-tight line-clamp-2 max-w-[80px]">{c.name}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* ANNONCES / PLATS : tuiles carrées (texte). */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
            {STATIC_CATS[section].map((c) => (
              <button key={c} onClick={() => go(c)}
                className="aspect-[4/3] rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:scale-[0.98] flex items-center justify-center text-center px-3 text-[13.5px] font-medium text-white/90 transition-colors">
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
