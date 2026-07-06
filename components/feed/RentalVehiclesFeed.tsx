'use client';

/**
 * RentalVehiclesFeed (Pascal 2026-07-05) — onglet « Location » du marché. Véhicules à
 * louer (annonces Véhicules rental=1), TRIÉS par PROXIMITÉ (les plus proches d'abord)
 * quand la géoloc est accordée. Tap sur une card → LE VRAI FLUX DRIVE (`RentalSheet` :
 * calendrier de dispo → Réserver & payer Mobile Money). PAS de « Contacter » maison.
 *
 * Card OS (Pascal 2026-07-05) : le visuel est rendu par LE VRAI LECTEUR SuperCardView —
 * EXACTEMENT comme AnnoncesFeed — via `readVehicleCard` (parseCard du `.card` stocké,
 * fallback adaptateur pour les vieilles annonces). Plus aucune card maison ; RentalSheet
 * reste l'ACTION (réservation). Badge distance + chauffeur en surcouche (présentation).
 */
import { useEffect, useState } from 'react';
import { Loader2, Car, MapPin } from '@/lib/icons';
import RentalSheet from '@/components/drive/RentalSheet';
import SuperCardView from '@/components/cards/SuperCardView';
import { fromAnnonceItem } from '@/lib/cards/adapt';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';

interface Vehicle {
  id: string; title: string; description: string | null;
  price_label: string | null; city: string | null; image_url: string | null;
  driver_option: string | null;
  distance_km?: number | null;
  dotcard?: string | null;
  seller: { username: string; display_name: string | null } | null;
}

function driverBadge(o: string | null): string {
  return o === 'with' ? 'Location · avec chauffeur' : o === 'without' ? 'Location · sans chauffeur' : o === 'both' ? 'Location · avec ou sans chauffeur' : 'Location';
}

// Card OS : le lecteur LIT le `.card` STOCKÉ (parseCard). L'adaptateur ne sert que de
// secours pour les vieux véhicules sans `.card`. Calqué sur AnnoncesFeed.readAnnonceCard.
function readVehicleCard(v: Vehicle): SuperCard {
  if (typeof v.dotcard === 'string' && v.dotcard) {
    const r = parseCard(v.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return fromAnnonceItem({
    id: v.id, media_url: v.image_url, title: v.title, category: 'Véhicules',
    price_label: v.price_label, description: v.description, city: v.city,
    rental: true, driver_option: v.driver_option, photos: null, attributes: null,
    quantity: null, deposit_cents: null,
  });
}

export default function RentalVehiclesFeed({ onBack: _onBack }: { embedded?: boolean; onBack?: () => void }) {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Vehicle | null>(null); // véhicule ouvert → RentalSheet (réservation)

  useEffect(() => {
    let done = false;
    const load = (pos?: { lat: number; lng: number }) => {
      if (done) return; done = true;
      const q = pos ? `?lat=${pos.lat}&lng=${pos.lng}` : '';
      fetch(`/api/drive/rentals${q}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d?.ok) setItems(d.vehicles || []); })
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
          <Car className="w-8 h-8 mx-auto mb-2 text-emerald-400" strokeWidth={1.6} />
          <p className="text-white/50 text-[14px]">Aucun véhicule en location pour l&apos;instant.</p>
          <p className="text-white/30 text-[12px] mt-1">Publie le tien via le bouton + « Créer » → Automobile.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto py-3">
        {/* Card OS : la MÊME grille/lecteur que les annonces normales (SuperCardView). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 px-4">
          {items.map((v) => (
            <button key={v.id} type="button" onClick={() => setSel(v)} className="text-left active:scale-[0.98] relative block">
              {/* Le visuel EST rendu par le moteur (lecteur SuperCard), comme AnnoncesFeed. */}
              <SuperCardView card={readVehicleCard(v)} variant="product" reveal={['media', 'title', 'price', 'place']} theme="dark" />
              {/* Badges T2M (présentation, pas data card) en overlay. */}
              <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white">{driverBadge(v.driver_option)}</span>
              {typeof v.distance_km === 'number' && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/70 text-emerald-200"><MapPin className="w-2.5 h-2.5" /> {v.distance_km < 1 ? `${Math.round(v.distance_km * 1000)} m` : `${v.distance_km} km`}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {/* Tap → LE flux Drive : calendrier de dispo + Réserver & payer (Mobile Money). */}
      {sel && <RentalSheet directItem={sel} onClose={() => setSel(null)} />}
    </>
  );
}
