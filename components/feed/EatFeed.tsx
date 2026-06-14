'use client';

/**
 * Talk2Me — Onglet EAT (Pascal 2026-06-10), façon Uber Eats. Liste des restos
 * (boutiques kind='eat'). Tap un resto → sa carte + panier + Commander (escrow).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronLeft, MapPin, Clock, Store } from 'lucide-react';
import BoutiqueSheet from './BoutiqueSheet';
import AddRestaurantSheet from './AddRestaurantSheet';

interface Resto { id: string; name: string; description: string | null; public_key: string; cover_url: string | null; items_count: number; lat: number | null; lng: number | null; prep_min: number | null }

// Distance à vol d'oiseau (km) entre deux positions.
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface OsmPlace { id: string; name: string; lat: number; lng: number; amenity: string; cuisine: string | null; emoji: string; address: string | null; phone: string | null; opening_hours: string | null; photo: string | null }

export default function EatFeed({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const [restos, setRestos] = useState<Resto[]>([]);
  const [loading, setLoading] = useState(true);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAsked, setGeoAsked] = useState(false);
  // Fiches « à revendiquer » : vrais restos du quartier (OSM) + devanture Mapillary. LIVE, non stocké.
  const [osm, setOsm] = useState<OsmPlace[]>([]);
  const [osmLoading, setOsmLoading] = useState(false);

  const loadRestos = () => {
    fetch('/api/eat', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setRestos(d.restaurants || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadRestos(); }, []);

  // Position du chauffeur → restos AUTOUR de lui (pause déj sur la route).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoAsked(true); },
      () => setGeoAsked(true),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  // Position dispo → fiches à revendiquer (OSM + Mapillary). Rien n'est sauvegardé.
  useEffect(() => {
    if (!me) return;
    setOsmLoading(true);
    fetch(`/api/eat/nearby?lat=${me.lat}&lng=${me.lng}&radius=1200`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setOsm(d.places || []); })
      .catch(() => {})
      .finally(() => setOsmLoading(false));
  }, [me]);

  const [claiming, setClaiming] = useState<string | null>(null);
  const claim = async (osmId: string) => {
    if (claiming) return;
    setClaiming(osmId);
    try {
      const r = await fetch('/api/eat/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osm_id: osmId }),
      }).then((x) => x.json());
      if (r?.ok && r.shop_id) router.push(`/ma-boutique/${r.shop_id}`);
      else setClaiming(null);
    } catch { setClaiming(null); }
  };

  const osmSorted = useMemo(() => {
    if (!me) return [] as { p: OsmPlace; d: number }[];
    const t2mNames = new Set(restos.map((r) => r.name.trim().toLowerCase()));
    return osm
      .filter((p) => !t2mNames.has(p.name.trim().toLowerCase()))
      .map((p) => ({ p, d: distKm(me, { lat: p.lat, lng: p.lng }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 30);
  }, [osm, me, restos]);

  // Tri par proximité (les restos avec position d'abord, plus proche en tête).
  const sorted = useMemo(() => {
    const withD = restos.map((r) => ({
      r,
      d: me && r.lat != null && r.lng != null ? distKm(me, { lat: r.lat, lng: r.lng }) : null,
    }));
    return withD.sort((a, b) => (a.d == null ? 1 : b.d == null ? -1 : a.d - b.d));
  }, [restos, me]);

  return (
    <div className="h-full w-full flex flex-col bg-[#0e0e12]">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8 bg-[#0e0e12]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80 hover:text-white"><ChevronLeft className="w-6 h-6" /></button>
        <span className="text-[20px]">🍔</span>
        <h1 className="text-[17px] font-semibold text-white/95">Eat</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* Ajoutez votre restaurant (enseigne, public Eat) */}
        <button onClick={() => setAddOpen(true)}
          className="w-full mb-3 py-3 rounded-2xl border border-dashed border-white/25 text-white/90 text-[14px] font-semibold active:scale-[0.99]">
          + Ajoutez votre restaurant
        </button>
        {/* Bandeau géoloc : restos autour du chauffeur */}
        <div className="flex items-center gap-1.5 px-1 mb-2 text-[12px]">
          <MapPin className="w-4 h-4 text-amber-300" />
          <span className="text-white/70">{me ? 'Restos autour de toi' : geoAsked ? 'Active ta position pour les restos proches' : 'Localisation…'}</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : restos.length === 0 ? (
          <p className="text-center text-white/40 text-[13px] px-8 py-12">Aucun resto pour l’instant.<br />Crée le tien depuis Amis → 🏪 → Restaurant.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map(({ r, d }) => (
              <button key={r.id} type="button" onClick={() => setOpenShop(r.public_key)}
                className="w-full text-left rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] active:scale-[0.99]">
                <div className="relative w-full h-36 bg-white/5">
                  {r.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                  <div className="absolute bottom-2 left-3 right-3">
                    <p className="text-[16px] font-bold text-white drop-shadow">{r.name}</p>
                    {r.description && <p className="text-[12px] text-white/80 line-clamp-1 drop-shadow">{r.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/90">
                      {d != null && <span className="flex items-center gap-1 drop-shadow"><MapPin className="w-3 h-3" />{d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'}</span>}
                      <span className="flex items-center gap-1 drop-shadow"><Clock className="w-3 h-3" />prêt ~{r.prep_min || 12} min</span>
                    </div>
                  </div>
                  <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-amber-500 text-black font-semibold">{r.items_count} plat{r.items_count > 1 ? 's' : ''}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* FICHES À REVENDIQUER — vrais restos du quartier (OSM) + devanture Mapillary. LIVE, non stocké. */}
        {me && (osmLoading || osmSorted.length > 0) && (
          <div className="mt-6">
            <div className="flex items-baseline gap-2 px-1 mb-2">
              <span className="text-[13px] font-semibold text-white/90">Restos du quartier</span>
              <span className="text-[11px] text-white/40">fiches à revendiquer</span>
            </div>
            {osmLoading ? (
              <div className="flex justify-center py-6 text-white/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {osmSorted.map(({ p, d }) => (
                  <div key={p.id} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
                    <div className="relative w-full h-28 bg-white/5">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[34px] opacity-60">{p.emoji}</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white/80 border border-white/15">Non revendiqué</span>
                      <div className="absolute bottom-2 left-3 right-3">
                        <p className="text-[15px] font-bold text-white drop-shadow">{p.emoji} {p.name}</p>
                        <p className="text-[11px] text-white/80 drop-shadow">{[p.cuisine?.replace(/_/g, ' '), d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km', p.address].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => claim(p.id)}
                      disabled={claiming === p.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500/15 text-amber-200 text-[13px] font-semibold active:scale-[0.99] disabled:opacity-50"
                    >
                      {claiming === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                      {claiming === p.id ? 'Création de la fiche…' : 'Faites plus de ventes — Revendiquez votre fiche'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/30 px-1 mt-2">Restos publics (OpenStreetMap) · devanture Mapillary · non partenaires — affichage live, non sauvegardé.</p>
          </div>
        )}
      </div>

      {openShop && <BoutiqueSheet shopKey={openShop} onClose={() => setOpenShop(null)} />}
      {addOpen && <AddRestaurantSheet onClose={() => setAddOpen(false)} onCreated={() => { setLoading(true); loadRestos(); }} />}
    </div>
  );
}
