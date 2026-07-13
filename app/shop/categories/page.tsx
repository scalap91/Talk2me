'use client';

/**
 * Talk2Me — Shop · Catégories (Pascal 2026-06-27, façon Temu ; blanc 2026-07-07).
 * Catégories CONTEXTUELLES à la section (Annonces / Boutiques / Plats) + des TUILES
 * dédiées (Services / Emploi / Location véhicule / Immobilier) mélangées aux cartes :
 * elles ouvrent leur feed dédié. Les onglets retirés d'AcheterHub vivent ici, en cartes.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ShopNav from '@/components/shop/ShopNav';
import { EAT_CATEGORIES } from '@/lib/eat-categories';

type Section = 'annonces' | 'boutiques' | 'plats';

// Annonces & Plats = listes fixes. Boutiques = catégories DYNAMIQUES (chargées).
const STATIC_CATS: Record<'annonces' | 'plats', readonly string[]> = {
  annonces: ['Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté', 'Loisirs', 'Autres'],
  plats: EAT_CATEGORIES,
};

// Sections dédiées (feeds propres) présentées comme des CARTES parmi les catégories.
// Un clic ouvre directement le feed (pas un filtre). Clés = celles d'AcheterHub.
const DEDIE: { key: string; label: string; emoji: string }[] = [
  { key: 'services', label: 'Services', emoji: '🔧' },
  { key: 'emploi', label: 'Emploi', emoji: '💼' },
  { key: 'location', label: 'Location véhicule', emoji: '🚗' },
  { key: 'immobilier', label: 'Immobilier', emoji: '🏠' },
];

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

  // Catégories Boutiques = les VRAIES catégories de la boutique (comme SheinStore) :
  // /api/shop/store → categories, image = 1ᵉʳ produit de la catégorie. (Avant : ae-categories,
  // vide sur dev → « Aucune catégorie » alors que 28 catégories existent. Fix Pascal 2026-07-07.)
  useEffect(() => {
    if (boutiqueCats !== null) return;
    fetch('/api/shop/store', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && Array.isArray(d.categories)) {
          setBoutiqueCats((d.categories as { category: string; products?: { image?: string | null }[] }[])
            .map((c) => ({ name: c.category, image: c.products?.[0]?.image ?? null }))
            .filter((c) => c.name));
        } else setBoutiqueCats([]);
      })
      .catch(() => setBoutiqueCats([]));
  }, [boutiqueCats]);

  // Clic sur une catégorie (filtre) → mémorise section + catégorie, ouvre /shop.
  const go = (c: string) => {
    try {
      sessionStorage.setItem('t2m_shop_section', section);
      sessionStorage.setItem('t2m_shop_category', c);
    } catch { /* */ }
    router.push('/shop');
  };
  // Clic sur une carte dédiée → ouvre son feed dédié dans /shop.
  const openFeed = (sectionKey: string) => {
    try { sessionStorage.setItem('t2m_shop_section', sectionKey); sessionStorage.removeItem('t2m_shop_category'); } catch { /* */ }
    router.push('/shop');
  };

  const tile = 'aspect-[4/3] rounded-2xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)] active:scale-[0.98] flex items-center justify-center text-center px-3 text-[13.5px] font-medium text-[var(--t2m-ink)] transition-colors';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--t2m-paper)] text-[var(--t2m-ink)]">
      {/* Header (flèche retour + titre « Catégories ») RETIRÉ (Pascal 2026-07-07) :
          doublon — ShopNav en haut montre déjà « Catégories », et le retour est géré
          par la nav app du bas. Le GlobalBackChip est masqué sur /shop/*. */}
      <ShopNav />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:pb-6">
        {section === 'boutiques' ? (
          /* BOUTIQUE : UNIQUEMENT les bulles RONDES (comme la home Boutique). Rien d'autre. */
          boutiqueCats === null ? (
            <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-10">Chargement…</p>
          ) : boutiqueCats.length === 0 ? (
            <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-10">Aucune catégorie.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 max-w-5xl mx-auto">
              {boutiqueCats.map((c) => (
                <button key={c.name} onClick={() => go(c.name)} className="flex flex-col items-center gap-1.5 active:scale-95">
                  <span className="w-[68px] h-[68px] rounded-full overflow-hidden bg-[var(--t2m-wash)] border border-[var(--t2m-line)] grid place-items-center">
                    {c.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[var(--t2m-ink-3)] text-[18px]">🛍️</span>}
                  </span>
                  <span className="text-[12px] text-[var(--t2m-ink)] text-center leading-tight line-clamp-2 max-w-[80px]">{c.name}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* ANNONCES : catégories d'annonces + les cartes dédiées (Services/Emploi/Location/
             Immobilier) — QUE dans ce contexte, c'est leur catégorie propre.
             PLATS : uniquement les catégories de cuisine, rien d'autre. */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
            {STATIC_CATS[section].map((c) => (
              <button key={c} onClick={() => go(c)} className={tile}>{c}</button>
            ))}
            {section === 'annonces' && DEDIE.map((d) => (
              <button key={d.key} onClick={() => openFeed(d.key)} className={tile}>{d.emoji} {d.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
