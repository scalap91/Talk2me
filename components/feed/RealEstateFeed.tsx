'use client';

/**
 * RealEstateFeed (Pascal 2026-07-05) — onglet « Immobilier » du marché. Biens à louer
 * (annonces Immobilier rental=1), TRIÉS par PROXIMITÉ (les plus proches d'abord) quand
 * la géoloc est accordée. Tap sur une card → LE VRAI FLUX DRIVE (`RentalSheet` en mode
 * logement : calendrier de dispo → Réserver & payer Mobile Money). PAS de « Contacter ».
 * PII air-gap : jamais d'owner_id/tel, juste username/display_name.
 *
 * Card OS (Pascal 2026-07-05) : le visuel est rendu par LE VRAI LECTEUR SuperCardView —
 * EXACTEMENT comme AnnoncesFeed — via `readListingCard` (parseCard du `.card` stocké,
 * fallback adaptateur pour les vieilles annonces). Plus aucune card maison ; RentalSheet
 * (propertyMode) reste l'ACTION (réservation). Badge distance en surcouche (présentation).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Home, MapPin } from '@/lib/icons';
import MarketFilterBar from './MarketFilterBar';
import RentalSheet from '@/components/drive/RentalSheet';
import SuperCardView from '@/components/cards/SuperCardView';
import { fromAnnonceItem } from '@/lib/cards/adapt';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';

interface Listing {
  id: string; title: string; description: string | null;
  price_label: string | null; city: string | null; image_url: string | null;
  type: string | null; // attributes.type (Appartement/Maison/Studio/…) — filtre catégorie
  distance_km?: number | null;
  dotcard?: string | null;
  seller: { username: string; display_name: string | null } | null;
}

// Card OS : le lecteur LIT le `.card` STOCKÉ (parseCard). L'adaptateur ne sert que de
// secours pour les vieux biens sans `.card`. Calqué sur AnnoncesFeed.readAnnonceCard.
function readListingCard(v: Listing): SuperCard {
  if (typeof v.dotcard === 'string' && v.dotcard) {
    const r = parseCard(v.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return fromAnnonceItem({
    id: v.id, media_url: v.image_url, title: v.title, category: 'Immobilier',
    price_label: v.price_label, description: v.description, city: v.city,
    rental: true, driver_option: null, photos: null, attributes: null,
    quantity: null, deposit_cents: null,
  });
}

export default function RealEstateFeed({ onBack: _onBack }: { embedded?: boolean; onBack?: () => void }) {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Listing | null>(null); // bien ouvert → RentalSheet (réservation logement)
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(''); // filtre type de bien ('' = tous)

  // Types de bien DISTINCTS réellement présents (v.type).
  const cats = useMemo(
    () => Array.from(new Set(items.map((v) => v.type).filter((t): t is string => !!t))),
    [items],
  );
  // Filtrage AVANT rendu : type + recherche (title/description/city). Sans type → seulement « Tout ».
  const shown = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return items.filter((v) =>
      (active === '' || active === 'Tout' || v.type === active) &&
      (!ql || (`${v.title} ${v.description || ''} ${v.city || ''}`).toLowerCase().includes(ql)),
    );
  }, [items, active, query]);

  useEffect(() => {
    let done = false;
    const load = (pos?: { lat: number; lng: number }) => {
      if (done) return; done = true;
      const q = pos ? `?lat=${pos.lat}&lng=${pos.lng}` : '';
      fetch(`/api/immo/listings${q}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d?.ok) setItems(d.listings || []); })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => load(),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      load();
    }
  }, []);

  if (loading) return <div className="h-full grid place-items-center text-white/30"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!items.length) {
    return (
      <div className="h-full grid place-items-center text-center px-8">
        <div>
          <Home className="w-8 h-8 mx-auto mb-2 text-emerald-400" strokeWidth={1.6} />
          <p className="text-white/50 text-[14px]">Aucun bien à louer pour l&apos;instant.</p>
          <p className="text-white/30 text-[12px] mt-1">Publie le tien via + « Créer » → Immobilier (transaction : Location).</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <MarketFilterBar
          placeholder="Rechercher un bien…"
          query={query} onQuery={setQuery}
          cats={cats} active={active} onActive={setActive}
        />
        <div className="flex-1 overflow-y-auto py-3">
        {shown.length === 0 ? (
          <p className="text-center text-white/40 text-[13px] px-8 py-10">Rien trouvé.</p>
        ) : (
        /* Card OS : la MÊME grille/lecteur que les annonces normales (SuperCardView). */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 px-4">
          {shown.map((v) => (
            <button key={v.id} type="button" onClick={() => setSel(v)} className="text-left active:scale-[0.98] relative block">
              {/* Le visuel EST rendu par le moteur (lecteur SuperCard), comme AnnoncesFeed. */}
              <SuperCardView card={readListingCard(v)} variant="product" reveal={['media', 'title', 'price', 'place']} theme="dark" />
              {/* Badge distance (présentation, pas data card) en overlay. */}
              {typeof v.distance_km === 'number' && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/70 text-emerald-200"><MapPin className="w-2.5 h-2.5" /> {v.distance_km < 1 ? `${Math.round(v.distance_km * 1000)} m` : `${v.distance_km} km`}</span>
              )}
            </button>
          ))}
        </div>
        )}
        </div>
      </div>
      {/* Tap → flux Drive en mode logement : calendrier + Réserver & payer (Mobile Money). */}
      {sel && <RentalSheet directItem={{ ...sel, driver_option: null }} propertyMode onClose={() => setSel(null)} />}
    </>
  );
}
