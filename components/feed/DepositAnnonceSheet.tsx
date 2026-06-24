'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — DÉPÔT D'ANNONCE (Pascal 2026-06-11). Formulaire IMPOSÉ en mode annonce :
 * photo, catégorie, titre, description, prix, ville. Enregistrer en BROUILLON ou
 * PUBLIER. Option : rattacher à une de ses boutiques. Données réelles (grounding).
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, ImagePlus, MapPin } from 'lucide-react';
import { fromMinor, currencyLabel } from '@/lib/money';

const CATEGORIES = ['Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté', 'Plat', 'Loisirs', 'Services', 'Emploi', 'Immobilier', 'Autres'];

export interface AnnonceDraft {
  id?: string;
  title?: string;
  description?: string | null;
  category?: string;
  price_cents?: number | null;
  city?: string | null;
  image_url?: string | null;
  shop_id?: string | null;
  status?: 'draft' | 'published';
}

export default function DepositAnnonceSheet({
  initial, onClose, onSaved,
}: { initial?: AnnonceDraft; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [price, setPrice] = useState(initial?.price_cents != null ? String(fromMinor(initial.price_cents)) : '');
  const [city, setCity] = useState(initial?.city || '');
  const [image, setImage] = useState<string | null>(initial?.image_url || null);
  const [shopId, setShopId] = useState<string>(initial?.shop_id || '');
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'published' | 'upload'>(null);
  const [err, setErr] = useState('');

  const isPlat = category === 'Plat';
  const locate = () => {
    if (!('geolocation' in navigator)) { setErr('Géolocalisation indisponible sur cet appareil.'); return; }
    setGeoBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); setGeoBusy(false); },
      () => { setGeoBusy(false); setErr('Localisation refusée. Autorise la position (obligatoire pour un plat).'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    fetch('/api/annonces/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setShops(d.shops || []); })
      .catch(() => {});
  }, []);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy('upload');
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d?.url) setImage(d.url);
    } finally { setBusy(null); }
  };

  const save = async (status: 'draft' | 'published') => {
    setErr('');
    if (!title.trim()) { setErr('Donne un titre à ton annonce.'); return; }
    if (!category) { setErr('Choisis une catégorie.'); return; }
    if (status === 'published') {
      if (!image) { setErr('Ajoute une photo pour publier.'); return; }
      if (!price.trim()) { setErr('Indique un prix pour publier.'); return; }
      if (!city.trim()) { setErr('Indique ta ville pour publier.'); return; }
      if (isPlat && (lat == null || lng == null)) { setErr('Un plat doit être géolocalisé — appuie sur « 📍 Me localiser ».'); return; }
    }
    // Parse prix robuste : on garde chiffres + 1 séparateur décimal (gère « 1 234,56 », « 1,234.56 »).
    let priceNum: number | null = null;
    if (price.trim()) {
      const c = price.replace(/[^\d.,]/g, '').replace(/,/g, '.');
      const parts = c.split('.');
      const norm = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : c;
      const v = parseFloat(norm);
      priceNum = Number.isFinite(v) ? v : null;
    }
    setBusy(status);
    try {
      const r = await fetch('/api/annonces/mine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial?.id, title: title.trim(), description: description.trim(), category,
          price: priceNum,
          city: city.trim() || null, image_url: image, shop_id: shopId || null, status,
          lat, lng,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'geo_required' ? 'Un plat doit être géolocalisé (appuie sur « 📍 Me localiser »).' : d?.error === 'incomplete' ? 'Pour publier : photo + prix + ville obligatoires.' : 'Échec, réessaie.'); setBusy(null); return; }
      onSaved();
    } finally { setBusy(null); }
  };

  const label = 'block text-[12px] text-white/55 mb-1';
  const field = 'w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50';

  return (
    <div className="fixed inset-0 z-[80] bg-[#0e0e12] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80 active:bg-white/10"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold text-white/95">{initial?.id ? 'Modifier l’annonce' : 'Nouvelle annonce'}</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {/* Photo */}
          <div>
            <span className={label}>Photo</span>
            <label className="block w-full aspect-[16/10] rounded-xl border border-dashed border-white/20 bg-white/[0.04] overflow-hidden cursor-pointer">
              {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : (
                <span className="w-full h-full grid place-items-center text-white/40">
                  {busy === 'upload' ? <Loader2 className="w-6 h-6 animate-spin" /> : <span className="flex flex-col items-center gap-1"><ImagePlus className="w-7 h-7" /><span className="text-[12px]">Ajouter une photo</span></span>}
                </span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={upload} />
            </label>
          </div>

          {/* Catégorie (imposée) */}
          <div>
            <span className={label}>Catégorie *</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={field + (category ? '' : ' text-white/40')}>
              <option value="">Choisir une catégorie…</option>
              {CATEGORIES.map((c) => <option key={c} value={c} className="text-black">{c}</option>)}
            </select>
          </div>

          {/* Titre */}
          <div>
            <span className={label}>Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex : iPhone 13 très bon état" className={field} />
          </div>

          {/* Description */}
          <div>
            <span className={label}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Décris ce que tu vends : état, détails, raison de la vente…" className={field + ' resize-none leading-relaxed'} />
          </div>

          {/* Prix + Ville */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Prix ({currencyLabel()})</span>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="0" className={field} />
            </div>
            <div>
              <span className={label}>Ville</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Ex : Casablanca" className={field} />
            </div>
          </div>

          {/* Géolocalisation — requise pour un Plat (économie de proximité) */}
          <div>
            <span className={label}>{isPlat ? 'Position du plat (obligatoire)' : 'Position (optionnel)'}</span>
            <button
              type="button"
              onClick={locate}
              disabled={geoBusy}
              className={'w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 ' + (lat != null ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30' : isPlat ? 'bg-red-600 text-white' : 'bg-white/10 text-white/80')}
            >
              {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {geoBusy ? 'Localisation…' : lat != null ? '✓ Position enregistrée' : '📍 Me localiser'}
            </button>
            {isPlat && <p className="text-[10.5px] text-amber-200/80 mt-1">Un plat doit être géolocalisé pour apparaître près des acheteurs.</p>}
          </div>

          {/* Rattacher à une boutique (optionnel) */}
          {shops.length > 0 && (
            <div>
              <span className={label}>Mettre dans une de mes boutiques (optionnel)</span>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={field + (shopId ? '' : ' text-white/40')}>
                <option value="">Aucune (annonce simple)</option>
                {shops.map((s) => <option key={s.id} value={s.id} className="text-black">{s.name}</option>)}
              </select>
            </div>
          )}

          {err && <p className="text-red-400 text-[13px]">{err}</p>}

          <p className="text-[11px] text-white/40 leading-snug">Pour <b>publier</b> : photo + prix + ville obligatoires. Le <b>brouillon</b> garde ton annonce sans la rendre visible.</p>

          <div className="flex gap-2.5 pt-1">
            <button onClick={() => save('draft')} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {busy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Brouillon
            </button>
            <button onClick={() => save('published')} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {busy === 'published' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Publier
            </button>
          </div>
      </div>
    </div>
  );
}
