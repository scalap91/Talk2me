'use client';

/**
 * AcheterHub (Pascal 2026-06-17) — UNE seule rubrique « Acheter » qui réunit
 * Boutiques (SheinStore) + Plats maison (EatFeed) + Annonces (AnnoncesFeed),
 * via une barre de filtres unique. Remplace les 3 sous-onglets séparés du Hub.
 * ADN : le marché de proximité, tout au même endroit.
 */
import { useState } from 'react';
import { ChevronLeft, UtensilsCrossed, Store, Tag } from 'lucide-react';
import EatFeed from './EatFeed';
import AnnoncesFeed from './AnnoncesFeed';
import SheinStore from '@/components/shop/SheinStore';

type Filtre = 'boutiques' | 'plats' | 'annonces';
const FILTRES: { k: Filtre; label: string; Icon: React.ElementType }[] = [
  { k: 'boutiques', label: 'Boutiques', Icon: Store },
  { k: 'plats', label: 'Eat', Icon: UtensilsCrossed },
  { k: 'annonces', label: 'Annonces', Icon: Tag },
];

export default function AcheterHub({ onBack }: { onBack?: () => void }) {
  const [f, setF] = useState<Filtre>('boutiques');
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
          {FILTRES.map(({ k, label, Icon }) => (
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
        {f === 'boutiques' && <SheinStore embedded onBack={onBack} />}
        {f === 'plats' && <EatFeed embedded onBack={onBack} />}
        {f === 'annonces' && <AnnoncesFeed embedded onBack={onBack} />}
      </div>
    </div>
  );
}
