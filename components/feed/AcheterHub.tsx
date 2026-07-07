'use client';

/**
 * AcheterHub (Pascal 2026-06-17) — UNE seule rubrique « Acheter » qui réunit
 * Boutiques (SheinStore) + Plats maison (EatFeed) + Annonces (AnnoncesFeed),
 * via une barre de filtres unique. Remplace les 3 sous-onglets séparés du Hub.
 * ADN : le marché de proximité, tout au même endroit.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, UtensilsCrossed, Store, Tag, Wrench, Briefcase, Car, Home, Loader2 } from '@/lib/icons';
import EatFeed from './EatFeed';
import AnnoncesFeed from './AnnoncesFeed';
import ServiceEmploiFeed from './ServiceEmploiFeed';
import RentalVehiclesFeed from './RentalVehiclesFeed';
import RealEstateFeed from './RealEstateFeed';
import SheinStore from '@/components/shop/SheinStore';

type Filtre = 'boutiques' | 'plats' | 'annonces' | 'services' | 'emploi' | 'location' | 'immobilier';
type Section = 'boutique' | 'eat' | 'annonces' | 'service' | 'emploi' | 'location' | 'immobilier';
// Chaque onglet est rattaché à une sous-section switchable par le Super-Admin.
const FILTRES: { k: Filtre; section: Section; label: string; Icon: React.ElementType }[] = [
  { k: 'boutiques', section: 'boutique', label: 'Boutiques', Icon: Store },
  { k: 'plats', section: 'eat', label: 'Eat', Icon: UtensilsCrossed },
  { k: 'annonces', section: 'annonces', label: 'Annonces', Icon: Tag },
  { k: 'services', section: 'service', label: 'Services', Icon: Wrench },
  { k: 'emploi', section: 'emploi', label: 'Emploi', Icon: Briefcase },
  { k: 'location', section: 'location', label: 'Location', Icon: Car },
  { k: 'immobilier', section: 'immobilier', label: 'Immobilier', Icon: Home },
];

export default function AcheterHub({ onBack }: { onBack?: () => void }) {
  // Ouvre sur la dernière section visitée (mémorisée), sinon Boutiques.
  const [f, setF] = useState<Filtre>(() => {
    try { const s = sessionStorage.getItem('t2m_shop_section'); if (s === 'boutiques' || s === 'plats' || s === 'annonces' || s === 'services' || s === 'emploi' || s === 'location' || s === 'immobilier') return s as Filtre; } catch { /* */ }
    return 'boutiques';
  });
  // Sous-sections actives (Super-Admin). Par défaut tout ON ; on raffine au fetch.
  const [sections, setSections] = useState<Record<Section, boolean>>({ boutique: true, eat: true, annonces: true, service: true, emploi: true, location: true, immobilier: true });
  // ⚠️ Anti-flash (Pascal 2026-06-24) : tant que l'état des interrupteurs n'est pas
  // chargé, on n'affiche AUCUN onglet — sinon le Shop (onglet par défaut) clignote
  // une fraction de seconde avant de basculer sur Annonces quand le Shop est OFF.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/shop/state', { cache: 'no-store' })
      .then((r) => r.json())
      // Merge (pas de remplacement) : une réponse sans service/emploi ne doit pas
      // masquer ces onglets — ils restent ON par défaut tant que l'admin ne les coupe pas.
      .then((d) => { if (d?.sections) setSections((prev) => ({ ...prev, ...d.sections })); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Mémorise la section active → la page Catégories l'utilise comme défaut.
  useEffect(() => { try { sessionStorage.setItem('t2m_shop_section', f); } catch { /* */ } }, [f]);

  const visibles = FILTRES.filter((x) => sections[x.section]);
  // Si l'onglet courant est désactivé → bascule sur le premier visible (après chargement).
  useEffect(() => {
    if (loaded && visibles.length && !visibles.some((x) => x.k === f)) setF(visibles[0].k);
  }, [sections, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full w-full flex flex-col bg-[var(--t2m-paper)]">
      {/* Header (retour + onglets sections) RETIRÉ (Pascal 2026-07-07) : doublon avec la
          nav Shop du haut qui a déjà « Catégories ». La section active vient du Hub
          (sessionStorage t2m_shop_section) ou du fallback ci-dessus. */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--t2m-paper)]">
        {!loaded ? (
          <div className="h-full grid place-items-center text-[var(--t2m-ink-3)]"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : visibles.length === 0 ? (
          <div className="h-full grid place-items-center text-[var(--t2m-ink-2)] text-[14px] px-8 text-center">Le Shop est temporairement fermé.</div>
        ) : (
          <>
            {f === 'boutiques' && sections.boutique && <SheinStore embedded onBack={onBack} />}
            {f === 'plats' && sections.eat && <EatFeed embedded onBack={onBack} />}
            {f === 'annonces' && sections.annonces && <AnnoncesFeed embedded onBack={onBack} />}
            {f === 'services' && sections.service && <ServiceEmploiFeed kind="service" embedded onBack={onBack} />}
            {f === 'emploi' && sections.emploi && <ServiceEmploiFeed kind="emploi" embedded onBack={onBack} />}
            {f === 'location' && sections.location && <RentalVehiclesFeed embedded onBack={onBack} />}
            {f === 'immobilier' && sections.immobilier && <RealEstateFeed embedded onBack={onBack} />}
          </>
        )}
      </div>
    </div>
  );
}
