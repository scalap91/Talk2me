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
import { EAT_CATEGORIES } from '@/lib/eat-categories';
import { imageHasPhoneNumber, CONTACT_LEAK_MSG } from '@/lib/client/image-guard';

interface Dish { key: string; image_url: string; label: string; price: string; description?: string; section?: string; uploading?: boolean }

const SECTIONS = ['Entrées', 'Plats', 'Desserts', 'Boissons'];

async function uploadFile(file: File): Promise<string | null> {
  // Anti-désintermédiation : refuse une photo qui porte un numéro (OCR on-device).
  if (await imageHasPhoneNumber(file)) { alert(CONTACT_LEAK_MSG); return null; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const d = await r.json();
    return r.ok && d.url ? d.url : null;
  } catch { return null; }
}

type RestoDraft = { name?: string; cuisine?: string; zone?: string; address?: string; phone?: string; hours?: string; modes?: { sur_place: boolean; emporter: boolean; livraison: boolean }; deliveryFee?: string; minOrder?: string; cover?: string; lat?: number | null; lng?: number | null; dishes?: { image_url: string; label: string; price: string; description?: string; section?: string }[] };

export default function AddRestaurantSheet({ onClose, onCreated, draftId, initial, claimOsmId }: { onClose: () => void; onCreated?: () => void; draftId?: string; initial?: RestoDraft; claimOsmId?: string }) {
  const [name, setName] = useState(initial?.name || '');
  const [cuisine, setCuisine] = useState(initial?.cuisine || '');
  const [zone, setZone] = useState(initial?.zone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [hours, setHours] = useState(initial?.hours || '');
  const [modes, setModes] = useState(initial?.modes || { sur_place: true, emporter: true, livraison: false });
  const [deliveryFee, setDeliveryFee] = useState(initial?.deliveryFee || '');
  const [minOrder, setMinOrder] = useState(initial?.minOrder || '');
  const [cover, setCover] = useState(initial?.cover || '');
  const [coverBusy, setCoverBusy] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>(
    initial?.dishes?.length
      ? initial.dishes.map((d, i) => ({ key: 'd' + i, image_url: d.image_url, label: d.label || '', price: d.price || '', description: d.description || '', section: d.section || '' }))
      : []
  );
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
          address: address.trim() || null,
          phone: phone.trim() || null,
          hours: hours.trim() || null,
          serviceMode: Object.entries(modes).filter(([, on]) => on).map(([k]) => k).join(',') || null,
          deliveryFeeCents: modes.livraison && deliveryFee ? Math.round(parseFloat(deliveryFee.replace(',', '.')) * 100) : null,
          minOrderCents: modes.livraison && minOrder ? Math.round(parseFloat(minOrder.replace(',', '.')) * 100) : null,
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
          body: JSON.stringify({ image_url: dish.image_url, label: dish.label.trim() || null, price: parseFloat(dish.price.replace(',', '.')) || 0, description: (dish.description || '').trim() || null, section: dish.section || null }),
        }).catch(() => {});
      }
      // Revendication : on lie le lieu OSM à la fiche qu'on vient de créer (même modèle
      // que « Ajouter ») → le lieu quitte la liste « à revendiquer ».
      if (claimOsmId) {
        await fetch('/api/eat/claim', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ osm_id: claimOsmId, shop_id: shopId }),
        }).catch(() => {});
      }
      if (draftId) await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
      onCreated?.();
      onClose();
    } finally { setBusy(false); }
  };

  // Enregistre le formulaire resto comme BROUILLON (repris depuis Mes Cards).
  const saveDraft = async () => {
    if (busy) return;
    const ds = dishes.filter((d) => d.image_url).map((d) => ({ image_url: d.image_url, label: d.label, price: d.price, description: d.description || '', section: d.section || '' }));
    if (!name.trim() && ds.length === 0) { setErr('Rien à enregistrer.'); return; }
    setErr(''); setBusy(true);
    try {
      await fetch('/api/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          type: 'resto',
          title: name.trim() || 'Restaurant',
          thumbnail_url: cover || ds[0]?.image_url || null,
          draft_data: { name, cuisine, zone, address, phone, hours, modes, deliveryFee, minOrder, cover, lat: pos?.lat ?? null, lng: pos?.lng ?? null, dishes: ds },
        }),
      });
      onCreated?.();
      onClose();
    } finally { setBusy(false); }
  };

  const field = 'w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3.5 py-3 text-[14px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]';

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[92dvh] overflow-y-auto bg-[var(--t2m-paper)] rounded-t-3xl border-t border-[var(--t2m-line)] p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-[var(--t2m-ink-3)] mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[var(--t2m-ink)] text-[18px] font-bold">Ajoutez votre restaurant</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] text-[13px]">Fermer</button>
        </div>

        {/* COUVERTURE */}
        <label className="block relative w-full h-36 rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-wash)] mb-3 cursor-pointer">
          {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : (
            <span className="absolute inset-0 grid place-items-center text-[var(--t2m-ink-3)] text-[13px]">{coverBusy ? 'Chargement…' : 'Photo de la devanture (couverture)'}</span>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
        </label>

        {/* INFOS RESTO */}
        <div className="space-y-2.5">
          <input className={field} placeholder="Nom du restaurant *" value={name} onChange={(e) => setName(e.target.value)} />

          {/* CATÉGORIE / CUISINE — liste fixe (mêmes catégories que la section Plats
              du Shop) pour que le resto soit retrouvable par catégorie. Une seule. */}
          <div>
            <span className="text-[var(--t2m-ink-2)] text-[12.5px] font-medium">Catégorie de cuisine</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {EAT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCuisine((cur) => (cur === c ? '' : c))}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
                    cuisine === c ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <input className={field} placeholder="Zone / quartier" value={zone} onChange={(e) => setZone(e.target.value)} />
          <input className={field} placeholder="Adresse complète" value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className={field} placeholder="Téléphone / contact" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className={field} placeholder="Horaires (ex : Lun–Sam 11h–23h)" value={hours} onChange={(e) => setHours(e.target.value)} />
          <button onClick={useMyPosition} disabled={geoBusy} className="w-full py-2.5 rounded-xl border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[13px] font-medium active:scale-[0.99] disabled:opacity-50">
            {geoBusy ? 'Localisation…' : pos ? 'Position enregistrée' : 'Utiliser ma position (resto proche des clients)'}
          </button>
        </div>

        {/* SERVICE */}
        <div className="mt-4">
          <span className="text-[var(--t2m-ink)] text-[14px] font-semibold">Service</span>
          <div className="flex gap-2 mt-2">
            {([['sur_place', 'Sur place'], ['emporter', 'À emporter'], ['livraison', 'Livraison']] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setModes((m) => ({ ...m, [k]: !m[k] }))}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium border transition-colors ${modes[k] ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]'}`}>
                {lbl}
              </button>
            ))}
          </div>
          {modes.livraison && (
            <div className="flex gap-2.5 mt-2.5">
              <input className={field} placeholder="Frais de livraison (€)" inputMode="decimal" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
              <input className={field} placeholder="Commande min. (€)" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
            </div>
          )}
        </div>

        {/* PLATS */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[var(--t2m-ink)] text-[14px] font-semibold">Plats / menu</span>
            <button onClick={addDish} className="px-3 py-1.5 rounded-full bg-[var(--t2m-primary)] text-white text-[13px] font-bold active:scale-95">+ Plat</button>
          </div>
          {dishes.length === 0 && <p className="text-[var(--t2m-ink-3)] text-[12px] px-1">Ajoute tes plats : photo, nom et prix.</p>}
          <div className="space-y-2.5">
            {dishes.map((dish) => (
              <div key={dish.key} className="flex items-center gap-2.5 bg-white border border-[var(--t2m-line)] rounded-xl p-2">
                <label className="relative w-16 h-16 rounded-lg overflow-hidden bg-[var(--t2m-wash)] shrink-0 cursor-pointer grid place-items-center">
                  {dish.image_url ? <img src={dish.image_url} alt="" className="w-full h-full object-cover" /> : (
                    <span className="text-[var(--t2m-ink-3)] text-[10px] text-center px-1">{dish.uploading ? '…' : 'Photo'}</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickDishPhoto(dish.key, e.target.files?.[0])} />
                </label>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none" placeholder="Nom du plat" value={dish.label} onChange={(e) => setDish(dish.key, { label: e.target.value })} />
                  <input className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none" placeholder="Description (ingrédients…)" value={dish.description || ''} onChange={(e) => setDish(dish.key, { description: e.target.value })} />
                  <div className="flex gap-1.5">
                    <input className="flex-1 min-w-0 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none" placeholder="Prix (€)" inputMode="decimal" value={dish.price} onChange={(e) => setDish(dish.key, { price: e.target.value })} />
                    <select className="bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2 py-2 text-[12px] text-[var(--t2m-ink)] outline-none" value={dish.section || ''} onChange={(e) => setDish(dish.key, { section: e.target.value })}>
                      <option value="" className="bg-[var(--t2m-paper)]">Section…</option>
                      {SECTIONS.map((s) => <option key={s} value={s} className="bg-[var(--t2m-paper)]">{s}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={() => removeDish(dish.key)} className="shrink-0 w-8 h-8 rounded-full bg-[var(--t2m-wash)] text-[var(--t2m-ink-3)] grid place-items-center self-start">×</button>
              </div>
            ))}
          </div>
        </div>

        {err && <p className="text-[var(--t2m-ink-2)] text-[12px] mt-3 bg-[var(--t2m-wash)] rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-2.5 mt-4">
          <button onClick={saveDraft} disabled={busy} className="flex-[0_0_auto] px-4 py-3.5 rounded-xl border border-[var(--t2m-line)] text-[var(--t2m-ink)] text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40">Brouillon</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-3.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[15px] font-bold active:scale-[0.99] disabled:opacity-40">
            {busy ? 'Création…' : 'Publier mon restaurant'}
          </button>
        </div>
        <p className="text-[var(--t2m-ink-3)] text-[11px] text-center mt-2">Visible publiquement dans Eat. Pour un plat fait maison vendu à tes proches, passe par une story ou le feed amis.</p>
      </div>
    </div>
  );
}
