'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Plat maison (Pascal 2026-06-14).
 * La mama qui cuisine chez elle : quelques plats faits maison (photo, nom, prix)
 * que ses VOISINS / AMIS peuvent acheter direct. Ce N'EST PAS un resto et ça ne
 * va PAS dans Eat ni en public — uniquement le feed Amis (vente entre proches).
 * Réutilise le module boutique (kind 'plat_maison'). Monochrome, sans emoji.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import DriveMap from '@/components/drive/DriveMap';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';

interface Dish { key: string; image_url: string; label: string; price: string; uploading?: boolean }

async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const d = await r.json();
    return r.ok && d.url ? d.url : null;
  } catch { return null; }
}

type PlatDraft = { name?: string; lat?: number | null; lng?: number | null; dishes?: { image_url: string; label: string; price: string }[] };

export default function AddPlatMaisonSheet({ onClose, onCreated, draftId, initial }: { onClose: () => void; onCreated?: () => void; draftId?: string; initial?: PlatDraft }) {
  const [name, setName] = useState(initial?.name || '');
  const [dishes, setDishes] = useState<Dish[]>(
    initial?.dishes?.length
      ? initial.dishes.map((d, i) => ({ key: 'd' + i, image_url: d.image_url, label: d.label || '', price: d.price || '' }))
      : [{ key: 'd0', image_url: '', label: '', price: '' }]
  );
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [mapPos, setMapPos] = useState<{ lat: number; lng: number } | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [nearby, setNearby] = useState<Array<{ id: string; public_key: string; name: string; lat: number | null; lng: number | null }>>([]);
  const [addr, setAddr] = useState('');                 // adresse de recherche (acheteur)
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null); // plat ouvert depuis la carte

  // Position GPS auto à l'ouverture (centre par défaut, + position du vendeur).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { const here = { lat: p.coords.latitude, lng: p.coords.longitude }; setMapPos(here); setPos((prev) => prev || here); },
      () => {}, { enableHighAccuracy: true, timeout: 7000 }
    );
  }, []);

  // Centre effectif = adresse cherchée si présente, sinon ma position GPS.
  const center = searchCenter || mapPos;

  // À chaque changement de centre → on récupère les plats autour (500 m fixe).
  useEffect(() => {
    if (!center) return;
    fetch(`/api/plat-maison/nearby?lat=${center.lat}&lng=${center.lng}&radius=500`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setNearby(d.plats || []); }).catch(() => {});
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recherche par ADRESSE → géocodage Nominatim (sans clé) → recentre la carte.
  const searchAddress = async () => {
    const a = addr.trim();
    if (!a || geocoding) return;
    setGeocoding(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(a)}`, { headers: { 'Accept-Language': 'fr' } });
      const d = await r.json();
      if (Array.isArray(d) && d[0]) setSearchCenter({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
    } catch { /* */ } finally { setGeocoding(false); }
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keyRef = useRef(0);
  const newKey = () => 'd' + (++keyRef.current);

  const useMyPosition = () => {
    if (!navigator.geolocation) return; setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoBusy(false); },
      () => setGeoBusy(false),
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const addDish = () => setDishes((d) => [...d, { key: newKey(), image_url: '', label: '', price: '' }]);
  const setDish = (key: string, patch: Partial<Dish>) => setDishes((d) => d.map((x) => x.key === key ? { ...x, ...patch } : x));
  const removeDish = (key: string) => setDishes((d) => d.filter((x) => x.key !== key));
  const pickPhoto = async (key: string, f: File | undefined) => {
    if (!f) return; setDish(key, { uploading: true });
    const url = await uploadFile(f);
    setDish(key, { uploading: false, image_url: url || '' });
  };

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setErr('Donne un nom (ex : « Les plats de Mama »).'); return; }
    const ready = dishes.filter((d) => d.image_url);
    if (ready.length === 0) { setErr('Ajoute au moins un plat avec sa photo.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plat_maison', name: name.trim(), lat: pos?.lat, lng: pos?.lng }),
      });
      const d = await r.json();
      if (!r.ok || !d.shop?.id) { setErr('Création impossible. Réessaie.'); setBusy(false); return; }
      const shopId = d.shop.id;
      for (const dish of ready) {
        await fetch(`/api/simple-shop/${shopId}/item`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: dish.image_url, label: dish.label.trim() || null, price: parseFloat(dish.price.replace(',', '.')) || 0 }),
        }).catch(() => {});
      }
      // publie la vitrine dans le feed Amis (category plat_maison)
      await fetch(`/api/simple-shop/${shopId}/publish`, { method: 'POST' }).catch(() => {});
      // publié → on supprime le brouillon s'il existait
      if (draftId) await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
      onCreated?.();
      onClose();
    } finally { setBusy(false); }
  };

  // Enregistre l'état du formulaire comme BROUILLON (repris depuis Mes Cards).
  const saveDraft = async () => {
    if (busy) return;
    const ready = dishes.filter((d) => d.image_url).map((d) => ({ image_url: d.image_url, label: d.label, price: d.price }));
    if (!name.trim() && ready.length === 0) { setErr('Rien à enregistrer.'); return; }
    setErr(''); setBusy(true);
    try {
      await fetch('/api/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          type: 'plat_maison',
          title: name.trim() || 'Plat maison',
          thumbnail_url: ready[0]?.image_url || null,
          draft_data: { name, lat: pos?.lat ?? null, lng: pos?.lng ?? null, dishes: ready },
        }),
      });
      onCreated?.();
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[92dvh] overflow-y-auto bg-[#101013] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white text-[18px] font-bold">Plat maison</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-[13px]">Fermer</button>
        </div>
        {/* ═══════════ HAUT : RECHERCHER UN PLAT (autour d'une adresse) ═══════════ */}
        <h3 className="text-white text-[14px] font-bold mb-2">Rechercher un plat</h3>
        <form onSubmit={(e) => { e.preventDefault(); searchAddress(); }} className="flex items-center gap-2 bg-white/[0.07] rounded-full pl-3.5 pr-1.5 h-11 border border-white/10 mb-3">
          <Search className="w-4 h-4 text-white/45 shrink-0" />
          <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Adresse, ou touche un point sur la carte" className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-white placeholder-white/40" />
          <button type="submit" disabled={geocoding} className="shrink-0 px-3 h-8 rounded-full bg-white text-black text-[12px] font-bold disabled:opacity-50">{geocoding ? '…' : 'Chercher'}</button>
        </form>

        {/* Carte : les NOMS des plats apparaissent dessus → clic → fiche → on vient chercher */}
        {center ? (
          <div>
            <DriveMap
              center={center}
              followCenter
              zoom={16}
              onMarkerClick={(id) => { if (id !== 'me') setOpenKey(id); }}
              onMapClick={(lat, lng) => setSearchCenter({ lat, lng })}
              markers={[
                { id: 'me', lat: center.lat, lng: center.lng, kind: 'me' as const, label: searchCenter ? 'Recherche ici' : 'Toi' },
                ...nearby
                  .filter((n) => n.lat != null && n.lng != null)
                  .map((n) => ({ id: n.public_key, lat: n.lat as number, lng: n.lng as number, kind: 'pickup' as const, label: n.name })),
              ]}
              className="h-44 w-full rounded-2xl overflow-hidden border border-white/10"
            />
            <p className="text-white/45 text-[11px] mt-1.5">
              {nearby.length ? `${nearby.length} plat${nearby.length > 1 ? 's' : ''} dans 500 m — touche un nom pour la fiche. ` : 'Aucun plat dans 500 m. '}
              <span className="text-white/35">Touche la carte pour chercher ailleurs (pas d'adresse). Pas de livraison : tu viens chercher.</span>
            </p>
          </div>
        ) : (
          <div className="h-44 w-full rounded-2xl border border-white/10 bg-white/[0.04] grid place-items-center text-white/40 text-[13px] animate-pulse">
            Localisation…
          </div>
        )}

        {/* ═══════════ BAS : PROPOSER UN PLAT (la mama crée le sien) ═══════════ */}
        <div className="my-4 border-t border-white/10" />
        <h3 className="text-white text-[14px] font-bold mb-1">Proposer un plat</h3>
        <p className="text-white/40 text-[12px] mb-3">Tes plats faits maison, vendus à tes voisins. Pas un resto, pas public.</p>

        <input className="w-full bg-white/[0.06] border border-white/12 rounded-xl px-3.5 py-3 text-[14px] text-white placeholder-white/35 outline-none focus:border-white/30 mb-2.5" placeholder="Nom (ex : Les plats de Mama)" value={name} onChange={(e) => setName(e.target.value)} />

        {/* Position : les voisins connectés dans 500 m voient tes plats */}
        <button onClick={useMyPosition} disabled={geoBusy} className="w-full mb-4 py-2.5 rounded-xl border border-white/15 text-white/85 text-[13px] font-medium active:scale-[0.99] disabled:opacity-50">
          {geoBusy ? 'Localisation…' : pos ? 'Position enregistrée — visible par les voisins (500 m)' : 'Utiliser ma position (visible par les voisins à 500 m)'}
        </button>

        <div className="flex items-center justify-between mb-2">
          <span className="text-white/90 text-[14px] font-semibold">Mes plats du jour</span>
          <button onClick={addDish} className="px-3 py-1.5 rounded-full bg-white text-black text-[13px] font-bold active:scale-95">+ Plat</button>
        </div>
        <div className="space-y-2.5">
          {dishes.map((dish) => (
            <div key={dish.key} className="flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-2">
              <label className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/30 shrink-0 cursor-pointer grid place-items-center">
                {dish.image_url ? <img src={dish.image_url} alt="" className="w-full h-full object-cover" /> : (
                  <span className="text-white/40 text-[10px] text-center px-1">{dish.uploading ? '…' : 'Photo'}</span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(dish.key, e.target.files?.[0])} />
              </label>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input className="w-full bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-2 text-[13px] text-white placeholder-white/35 outline-none" placeholder="Nom du plat" value={dish.label} onChange={(e) => setDish(dish.key, { label: e.target.value })} />
                <input className="w-full bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-2 text-[13px] text-white placeholder-white/35 outline-none" placeholder="Prix (€)" inputMode="decimal" value={dish.price} onChange={(e) => setDish(dish.key, { price: e.target.value })} />
              </div>
              {dishes.length > 1 && <button onClick={() => removeDish(dish.key)} className="shrink-0 w-8 h-8 rounded-full bg-white/5 text-white/40 grid place-items-center">×</button>}
            </div>
          ))}
        </div>

        {err && <p className="text-white/80 text-[12px] mt-3 bg-white/10 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-2.5 mt-4">
          <button onClick={saveDraft} disabled={busy} className="flex-[0_0_auto] px-4 py-3.5 rounded-xl border border-white/20 text-white text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40">Brouillon</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-3.5 rounded-xl bg-white text-black text-[15px] font-bold active:scale-[0.99] disabled:opacity-40">
            {busy ? '…' : 'Partager à mes voisins'}
          </button>
        </div>
        <p className="text-white/35 text-[11px] text-center mt-2">Visible seulement par tes amis dans leur feed. Ils achètent direct.</p>
      </div>
      {/* Détail d'un plat cliqué sur la carte → réserver / aller chercher */}
      {openKey && <BoutiqueSheet shopKey={openKey} onClose={() => setOpenKey(null)} />}
    </div>
  );
}
