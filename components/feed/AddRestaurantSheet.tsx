'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Ajouter votre restaurant (Pascal 2026-06-14).
 * Eat = les ENSEIGNES (restos formels, publics, distribués sur Eat). Ce formulaire
 * crée un resto (nom, type, zone, photo) + ses PLATS (photo, nom, prix).
 * NB : les plats informels (fait maison, revendus à l'entourage) ne passent PAS
 * par ici — ils vivent dans la story / le feed amis.
 * Monochrome strict, aucun emoji.
 */

import { useRef, useState } from 'react';

interface Dish { key: string; image_url: string; label: string; price: string; uploading?: boolean }

async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const d = await r.json();
    return r.ok && d.url ? d.url : null;
  } catch { return null; }
}

export default function AddRestaurantSheet({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [zone, setZone] = useState('');
  const [cover, setCover] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keyRef = useRef(0);
  const newKey = () => 'd' + (++keyRef.current);

  const pickCover = async (f: File | undefined) => {
    if (!f) return; setCoverBusy(true);
    const url = await uploadFile(f); setCoverBusy(false);
    if (url) setCover(url);
  };

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
  const pickDishPhoto = async (key: string, f: File | undefined) => {
    if (!f) return; setDish(key, { uploading: true });
    const url = await uploadFile(f);
    setDish(key, { uploading: false, image_url: url || '' });
  };

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setErr('Le nom du restaurant est obligatoire.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'eat',
          name: name.trim(),
          category: cuisine.trim() || null,
          description: zone.trim() || null,
          coverUrl: cover || null,
          lat: pos?.lat, lng: pos?.lng,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.shop?.id) { setErr('Création impossible. Réessaie.'); setBusy(false); return; }
      const shopId = d.shop.id;
      // ajoute chaque plat avec photo
      for (const dish of dishes) {
        if (!dish.image_url) continue;
        await fetch(`/api/simple-shop/${shopId}/item`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: dish.image_url, label: dish.label.trim() || null, price: parseFloat(dish.price.replace(',', '.')) || 0 }),
        }).catch(() => {});
      }
      onCreated?.();
      onClose();
    } finally { setBusy(false); }
  };

  const field = 'w-full bg-white/[0.06] border border-white/12 rounded-xl px-3.5 py-3 text-[14px] text-white placeholder-white/35 outline-none focus:border-white/30';

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[92dvh] overflow-y-auto bg-[#101013] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-[18px] font-bold">Ajoutez votre restaurant</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-[13px]">Fermer</button>
        </div>

        {/* COUVERTURE */}
        <label className="block relative w-full h-36 rounded-2xl overflow-hidden border border-white/12 bg-white/[0.04] mb-3 cursor-pointer">
          {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : (
            <span className="absolute inset-0 grid place-items-center text-white/45 text-[13px]">{coverBusy ? 'Chargement…' : 'Photo de la devanture (couverture)'}</span>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
        </label>

        {/* INFOS RESTO */}
        <div className="space-y-2.5">
          <input className={field} placeholder="Nom du restaurant *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={field} placeholder="Type de cuisine (ex : Burgers, Malagasy, Pizza)" value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
          <input className={field} placeholder="Zone / quartier / adresse" value={zone} onChange={(e) => setZone(e.target.value)} />
          <button onClick={useMyPosition} disabled={geoBusy} className="w-full py-2.5 rounded-xl border border-white/15 text-white/85 text-[13px] font-medium active:scale-[0.99] disabled:opacity-50">
            {geoBusy ? 'Localisation…' : pos ? 'Position enregistrée' : 'Utiliser ma position (resto proche des clients)'}
          </button>
        </div>

        {/* PLATS */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/90 text-[14px] font-semibold">Plats / menu</span>
            <button onClick={addDish} className="px-3 py-1.5 rounded-full bg-white text-black text-[13px] font-bold active:scale-95">+ Plat</button>
          </div>
          {dishes.length === 0 && <p className="text-white/35 text-[12px] px-1">Ajoute tes plats : photo, nom et prix.</p>}
          <div className="space-y-2.5">
            {dishes.map((dish) => (
              <div key={dish.key} className="flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl p-2">
                <label className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/30 shrink-0 cursor-pointer grid place-items-center">
                  {dish.image_url ? <img src={dish.image_url} alt="" className="w-full h-full object-cover" /> : (
                    <span className="text-white/40 text-[10px] text-center px-1">{dish.uploading ? '…' : 'Photo'}</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickDishPhoto(dish.key, e.target.files?.[0])} />
                </label>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input className="w-full bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-2 text-[13px] text-white placeholder-white/35 outline-none" placeholder="Nom du plat" value={dish.label} onChange={(e) => setDish(dish.key, { label: e.target.value })} />
                  <input className="w-full bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-2 text-[13px] text-white placeholder-white/35 outline-none" placeholder="Prix (€)" inputMode="decimal" value={dish.price} onChange={(e) => setDish(dish.key, { price: e.target.value })} />
                </div>
                <button onClick={() => removeDish(dish.key)} className="shrink-0 w-8 h-8 rounded-full bg-white/5 text-white/40 grid place-items-center">×</button>
              </div>
            ))}
          </div>
        </div>

        {err && <p className="text-white/80 text-[12px] mt-3 bg-white/10 rounded-lg px-3 py-2">{err}</p>}

        <button onClick={submit} disabled={busy} className="w-full mt-4 py-3.5 rounded-xl bg-white text-black text-[15px] font-bold active:scale-[0.99] disabled:opacity-40">
          {busy ? 'Création…' : 'Publier mon restaurant'}
        </button>
        <p className="text-white/35 text-[11px] text-center mt-2">Visible publiquement dans Eat. Pour un plat fait maison vendu à tes proches, passe par une story ou le feed amis.</p>
      </div>
    </div>
  );
}
