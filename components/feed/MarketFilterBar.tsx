'use client';

/**
 * MarketFilterBar (Pascal 2026-07-07) — barre BLANCHE (design system, tokens --t2m-*)
 * réutilisable en tête des feeds dédiés du marché (Services/Emploi, Véhicules, Immobilier).
 * Reprend le bloc « recherche + chips catégorie » d'AnnoncesFeed, factorisé.
 *
 * - Recherche : input fond --t2m-wash, arrondi, 🔍, placeholder --t2m-ink-3, texte --t2m-ink.
 * - Chips (pilules rounded-full) : « Tout » + catégories. Inactif = wash/ink-2 ; actif = ink/blanc.
 *   active==='' ou 'Tout' ⇒ pas de filtre catégorie. Aucune catégorie ⇒ pas de rangée de chips.
 * Le filtrage RÉEL du tableau reste à la charge du feed appelant (cette barre est pure UI).
 */
import { Search } from '@/lib/icons';

export interface MarketFilterBarProps {
  placeholder: string;
  query: string;
  onQuery: (s: string) => void;
  cats: string[];
  active: string;
  onActive: (c: string) => void;
}

export default function MarketFilterBar({ placeholder, query, onQuery, cats, active, onActive }: MarketFilterBarProps) {
  const isActive = (c: string) => (c === 'Tout' ? active === '' || active === 'Tout' : active === c);
  return (
    <div className="shrink-0 bg-[var(--t2m-paper)] px-4 pt-3 pb-3 border-b border-[var(--t2m-line)] space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t2m-ink-3)]" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[var(--t2m-wash)] border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-[var(--t2m-ink)] placeholder:text-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]"
        />
      </div>
      {cats.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {['Tout', ...cats].map((c) => (
            <button
              key={c}
              onClick={() => onActive(c === 'Tout' ? '' : c === active ? '' : c)}
              className={'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium ' + (isActive(c) ? 'bg-[var(--t2m-ink)] text-white' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)]')}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
