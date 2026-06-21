'use client';

/**
 * AcheterHub (Pascal 2026-06-17) — UNE seule rubrique « Acheter » qui réunit
 * Boutiques (SheinStore) + Plats maison (EatFeed) + Annonces (AnnoncesFeed),
 * via une barre de filtres unique. Remplace les 3 sous-onglets séparés du Hub.
 * ADN : le marché de proximité, tout au même endroit.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, UtensilsCrossed, Store, Tag } from 'lucide-react';
import EatFeed from './EatFeed';
import AnnoncesFeed from './AnnoncesFeed';
import SheinStore from '@/components/shop/SheinStore';

type Filtre = 'boutiques' | 'plats' | 'annonces';
type Section = 'boutique' | 'eat' | 'annonces';
// Chaque onglet est rattaché à une sous-section switchable par le Super-Admin.
const FILTRES: { k: Filtre; section: Section; label: string; Icon: React.ElementType }[] = [
  { k: 'boutiques', section: 'boutique', label: 'Boutiques', Icon: Store },
  { k: 'plats', section: 'eat', label: 'Eat', Icon: UtensilsCrossed },
  { k: 'annonces', section: 'annonces', label: 'Annonces', Icon: Tag },
];

export default function AcheterHub({ onBack }: { onBack?: () => void }) {
  const [f, setF] = useState<Filtre>('boutiques');
  // Sous-sections actives (Super-Admin). Par défaut tout ON ; on raffine au fetch.
  const [sections, setSections] = useState<Record<Section, boolean>>({ boutique: true, eat: true, annonces: true });

  useEffect(() => {
    fetch('/api/shop/state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.sections) setSections(d.sections); })
      .catch(() => {});
  }, []);

  const visibles = FILTRES.filter((x) => sections[x.section]);
  // Si l'onglet courant est désactivé → bascule sur le premier visible.
  useEffect(() => {
    if (visibles.length && !visibles.some((x) => x.k === f)) setF(visibles[0].k);
  }, [sections]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full w-full flex flex-col bg-[#0e0e12]">
      <header
        className="shrink-0 flex items-center gap-2 px-2 border-b border-white/8 bg-[#0e0e12]"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 3.25rem)' }}
      >
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80 hover:text-white shrink-0">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {visibles.map(({ k, label, Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setF(k)}
              className={`shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-[13px] font-medium border transition-colors ${
                f === k ? 'bg-white text-black border-white' : 'text-white/70 border-white/15 hover:bg-white/10'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {visibles.length === 0 ? (
          <div className="h-full grid place-items-center text-white/40 text-[14px] px-8 text-center">Le Shop est temporairement fermé.</div>
        ) : (
          <>
            {f === 'boutiques' && sections.boutique && <SheinStore embedded onBack={onBack} />}
            {f === 'plats' && sections.eat && <EatFeed embedded onBack={onBack} />}
            {f === 'annonces' && sections.annonces && <AnnoncesFeed embedded onBack={onBack} />}
          </>
        )}
      </div>
    </div>
  );
}
