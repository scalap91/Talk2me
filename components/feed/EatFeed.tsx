'use client';

/**
 * Talk2Me — Onglet EAT (Pascal 2026-06-10), façon Uber Eats. Liste des restos
 * (boutiques kind='eat'). Tap un resto → sa carte + panier + Commander (escrow).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronLeft, MapPin, Clock, Store } from '@/lib/icons';
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

export default function EatFeed({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const router = useRouter();
  const [restos, setRestos] = useState<Resto[]>([]);
  const [loading, setLoading] = useState(true);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const [claimPlace, setClaimPlace] = useState<OsmPlace | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [restoDraft, setRestoDraft] = useState<{ id: string; initial: unknown } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAsked, setGeoAsked] = useState(false);
  // Fiches « à revendiquer » : vrais restos du quartier (OSM) + devanture Mapillary. LIVE, non stocké.
  const [osm, setOsm] = useState<OsmPlace[]>([]);
  const [osmLoading, setOsmLoading] = useState(false);
  // Mode d'affichage posé par l'admin sur <html data-d-eat="cards|photo"> (défaut cards).
  const [mode, setMode] = useState<'cards' | 'photo'>('cards');
  useEffect(() => {
    const read = () => setMode(document.documentElement.dataset.dEat === 'photo' ? 'photo' : 'cards');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  const loadRestos = () => {
    fetch('/api/eat', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setRestos(d.restaurants || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadRestos(); }, []);

  // Eat n'a pas (encore) de filtre cuisine : on consomme la catégorie éventuelle
  // choisie dans Shop · Catégories pour qu'elle ne pollue pas Annonces/Boutiques.
  useEffect(() => { try { sessionStorage.removeItem('t2m_shop_category'); } catch { /* */ } }, []);

  // Reprise d'un BROUILLON Restaurant depuis Mes Cards (handoff sessionStorage).
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('t2m_open_draft'); } catch { /* */ }
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d?.type === 'resto' && d.id) {
        sessionStorage.removeItem('t2m_open_draft');
        fetch(`/api/drafts/${d.id}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((res) => { if (res?.draft) { setRestoDraft({ id: d.id, initial: res.draft.draft_data }); setAddOpen(true); } })
          .catch(() => {});
      }
    } catch { /* */ }
  }, []);

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
    <div className="h-full w-full flex flex-col bg-[var(--t2m-paper)]">
      {!embedded && (
        <header className="shrink-0 flex items-center gap-2 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]"><ChevronLeft className="w-6 h-6" /></button>
          <Store className="w-5 h-5 text-[var(--t2m-primary)]" />
          <h1 className="text-[17px] font-semibold text-[var(--t2m-ink)]">Eat</h1>
        </header>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* Ajoutez votre restaurant (enseigne, public Eat) */}
        <button onClick={() => setAddOpen(true)}
          className="w-full mb-3 py-3 rounded-2xl border border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[14px] font-semibold active:scale-[0.99]">
          + Ajoutez votre restaurant
        </button>
        {/* Bandeau géoloc : restos autour du chauffeur */}
        <div className="flex items-center gap-1.5 px-1 mb-2 text-[12px]">
          <MapPin className="w-4 h-4 text-[var(--t2m-ink-3)]" />
          <span className="text-[var(--t2m-ink-2)]">{me ? 'Restos autour de toi' : geoAsked ? 'Active ta position pour les restos proches' : 'Localisation…'}</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-[var(--t2m-ink-3)]"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : restos.length === 0 ? (
          <p className="text-center text-[var(--t2m-ink-3)] text-[13px] px-8 py-12">Aucun resto pour l’instant.<br />Ajoute le tien avec le bouton ci-dessus.</p>
        ) : mode === 'photo' ? (
          /* Mode PHOTO : mosaïque 2 colonnes, tuiles jointives (gap 0, bords carrés),
             infos écrites SUR la photo. La DATA et le tap→resto restent inchangés. */
          <div className="grid grid-cols-2" style={{ gap: 0 }}>
            {sorted.map(({ r, d }) => (
              <button key={r.id} type="button" onClick={() => setOpenShop(r.public_key)}
                className="relative block w-full text-left overflow-hidden active:scale-[0.98] bg-[var(--t2m-wash)]" style={{ aspectRatio: '1 / 1' }}>
                {r.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[var(--t2m-ink-3)]"><Store className="w-7 h-7" /></div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 55%)', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                  <p className="text-[14px] font-bold text-white leading-tight line-clamp-1">{r.name}</p>
                  <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-white/95">
                    {d != null && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />prêt ~{r.prep_min || 12} min</span>
                  </div>
                </div>
                <span className="absolute top-1.5 right-1.5 text-[10px] px-2 py-0.5 rounded-full bg-black/55 text-white font-semibold backdrop-blur-sm">{r.items_count} plat{r.items_count > 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        ) : (
          /* Mode CARDS : carte blanche (photo cover 16/10 + bloc blanc). */
          <div className="space-y-3">
            {sorted.map(({ r, d }) => (
              <button key={r.id} type="button" onClick={() => setOpenShop(r.public_key)}
                className="w-full text-left overflow-hidden active:scale-[0.99] block"
                style={{ borderRadius: 16, border: '1px solid var(--t2m-line)', boxShadow: '0 2px 10px rgba(47,52,58,.05)', background: 'var(--t2m-paper)' }}>
                <div className="relative w-full bg-[var(--t2m-wash)]" style={{ aspectRatio: '16 / 10' }}>
                  {r.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[var(--t2m-ink-3)]"><Store className="w-8 h-8" /></div>
                  )}
                  <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-white text-[var(--t2m-ink)] font-semibold shadow-sm">{r.items_count} plat{r.items_count > 1 ? 's' : ''}</span>
                </div>
                <div className="p-3">
                  <p className="text-[15px] font-bold text-[var(--t2m-ink)] leading-tight">{r.name}</p>
                  {r.description && <p className="text-[12px] text-[var(--t2m-ink-2)] line-clamp-1 mt-0.5">{r.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[12.5px] text-[var(--t2m-ink-2)]">
                    {d != null && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[var(--t2m-ink-3)]" />{d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[var(--t2m-ink-3)]" />prêt ~{r.prep_min || 12} min</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* FICHES À REVENDIQUER — vrais restos du quartier (OSM) + devanture Mapillary. LIVE, non stocké. */}
        {me && (osmLoading || osmSorted.length > 0) && (
          <div className="mt-6">
            <div className="flex items-baseline gap-2 px-1 mb-2">
              <span className="text-[13px] font-semibold text-[var(--t2m-ink)]">Restos du quartier</span>
              <span className="text-[11px] text-[var(--t2m-ink-3)]">fiches à revendiquer</span>
            </div>
            {osmLoading ? (
              <div className="flex justify-center py-6 text-[var(--t2m-ink-3)]"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {osmSorted.map(({ p, d }) => (
                  <div key={p.id} className="overflow-hidden" style={{ borderRadius: 16, border: '1px solid var(--t2m-line)', boxShadow: '0 2px 10px rgba(47,52,58,.05)', background: 'var(--t2m-paper)' }}>
                    <div className="relative w-full h-28 bg-[var(--t2m-wash)]">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[34px] opacity-70">{p.emoji}</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                      <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/55 text-white/90 backdrop-blur-sm">Non revendiqué</span>
                      <div className="absolute bottom-2 left-3 right-3" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                        <p className="text-[15px] font-bold text-white">{p.emoji} {p.name}</p>
                        <p className="text-[11px] text-white/90">{[p.cuisine?.replace(/_/g, ' '), d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km', p.address].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setClaimPlace(p)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--t2m-wash)] text-[var(--t2m-primary)] text-[13px] font-semibold active:scale-[0.99]"
                    >
                      <Store className="w-4 h-4" />
                      Faites plus de ventes — Revendiquez votre fiche
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[var(--t2m-ink-3)] px-1 mt-2">Restos publics (OpenStreetMap) · devanture Mapillary · non partenaires — affichage live, non sauvegardé.</p>
          </div>
        )}
      </div>

      {openShop && <BoutiqueSheet shopKey={openShop} onClose={() => setOpenShop(null)} />}
      {addOpen && <AddRestaurantSheet onClose={() => { setAddOpen(false); setRestoDraft(null); }} onCreated={() => { setLoading(true); loadRestos(); }} draftId={restoDraft?.id} initial={restoDraft?.initial as never} />}
      {/* REVENDIQUER = même formulaire resto, PRÉ-REMPLI depuis la fiche OSM (fini les
          placeholders d'annonce). À la validation, on lie le lieu OSM (claimOsmId). */}
      {claimPlace && (
        <AddRestaurantSheet
          onClose={() => setClaimPlace(null)}
          onCreated={() => { setLoading(true); loadRestos(); }}
          claimOsmId={claimPlace.id}
          initial={{
            name: claimPlace.name,
            cuisine: claimPlace.cuisine ? claimPlace.cuisine.replace(/_/g, ' ').replace(/;/g, ', ') : '',
            address: claimPlace.address || '',
            phone: claimPlace.phone || '',
            hours: claimPlace.opening_hours || '',
            cover: claimPlace.photo || '',
            lat: claimPlace.lat,
            lng: claimPlace.lng,
          }}
        />
      )}
    </div>
  );
}
