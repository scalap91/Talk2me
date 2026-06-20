'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Aperçu individuel d'un article de boutique (Pascal 2026-06-20).
 * Permet de : ré-éditer (nom, prix, description) ; (dés)activer l'article dans les
 * Petites annonces avec les champs manquants (catégorie, ville, géoloc) ; voir la
 * validité (3 mois) et la RENOUVELER manuellement. L'article reste dans la boutique
 * quoi qu'il arrive ; les annonces = visibilité étendue, optionnelle et réversible.
 */
import { useState } from 'react';
import { X, Loader2, MapPin, Megaphone, RefreshCw } from 'lucide-react';

const CATEGORIES = ['Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté', 'Loisirs', 'Services', 'Autres'];

export interface BoutiqueItem {
  id: string; image_url: string; label: string | null; price_cents: number; description?: string | null;
  annonce_on?: number; annonce_category?: string | null; annonce_city?: string | null;
  annonce_lat?: number | null; annonce_lng?: number | null; annonce_until?: number | null;
}

export default function BoutiqueItemSheet({
  shopId, item, onClose, onSaved,
}: { shopId: string; item: BoutiqueItem; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(item.label || '');
  const [price, setPrice] = useState(String(item.price_cents / 100));
  const [description, setDescription] = useState(item.description || '');
  const [annOn, setAnnOn] = useState(item.annonce_on === 1);
  const [category, setCategory] = useState(item.annonce_category || '');
  const [city, setCity] = useState(item.annonce_city || '');
  const [lat, setLat] = useState<number | null>(item.annonce_lat ?? null);
  const [lng, setLng] = useState<number | null>(item.annonce_lng ?? null);
  const [until, setUntil] = useState<number | null>(item.annonce_until ?? null);
  const [busy, setBusy] = useState<null | string>(null);
  const [err, setErr] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);

  const field = 'w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50';
  const lbl = 'block text-[12px] text-white/55 mb-1';
  const expired = until != null && until < Date.now();
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const patch = async (payload: object, key: string) => {
    setErr(''); setBusy(key);
    try {
      const r = await fetch(`/api/simple-shop/${shopId}/item`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, ...payload }),
      });
      const d = await r.json();
      if (!r.ok) { setErr('Échec, réessaie.'); return null; }
      return d.item;
    } finally { setBusy(null); }
  };

  const saveEdits = async () => {
    const it = await patch({ action: 'edit', label: label.trim() || null, price: parseFloat(price.replace(',', '.')) || 0, description: description.trim() || null }, 'edit');
    if (it) onSaved();
  };

  const locate = () => {
    if (!('geolocation' in navigator)) { setErr('Géolocalisation indisponible.'); return; }
    setGeoBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); setGeoBusy(false); },
      () => { setGeoBusy(false); setErr('Localisation refusée.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const enableAnnonce = async () => {
    if (!category) { setErr('Choisis une catégorie pour l’annonce.'); return; }
    if (!city.trim()) { setErr('Indique une ville pour l’annonce.'); return; }
    const it = await patch({ action: 'annonce', on: true, category, city: city.trim(), lat, lng }, 'enable');
    if (it) { setAnnOn(true); setUntil(it.annonce_until ?? null); onSaved(); }
  };
  const disableAnnonce = async () => {
    const it = await patch({ action: 'annonce', on: false }, 'disable');
    if (it) { setAnnOn(false); onSaved(); }
  };
  const renew = async () => {
    const it = await patch({ action: 'renew' }, 'renew');
    if (it) { setUntil(it.annonce_until ?? null); setAnnOn(true); onSaved(); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[92dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#101015]/95 backdrop-blur border-b border-white/8">
          <h2 className="text-white font-semibold text-[16px]">Mon article</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3.5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {/* Aperçu original */}
          <img src={item.image_url} alt={label} className="w-full aspect-square object-cover rounded-2xl border border-white/10" />

          {/* Ré-édition */}
          <div><span className={lbl}>Nom</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Nom de l’article" className={field} /></div>
          <div><span className={lbl}>Prix (€)</span><input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" className={field} /></div>
          <div><span className={lbl}>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Décris l’article…" className={field + ' resize-none leading-relaxed'} /></div>
          <button onClick={saveEdits} disabled={busy === 'edit'} className="w-full py-2.5 rounded-xl bg-white/10 text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy === 'edit' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer les modifications
          </button>

          {/* PETITES ANNONCES */}
          <div className="mt-2 p-3 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
            <div className="flex items-center gap-2 text-white/90 text-[14px] font-medium"><Megaphone className="w-4 h-4 text-emerald-300" /> Petites annonces</div>

            {annOn ? (
              <>
                <div className={`text-[12.5px] ${expired ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {expired ? '⏳ Annonce expirée' : '✓ Visible dans les Petites annonces'}
                  {until != null && <span className="text-white/55"> · {expired ? 'a expiré le' : 'valable jusqu’au'} {fmtDate(until)}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={renew} disabled={busy === 'renew'} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {busy === 'renew' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Renouveler 3 mois
                  </button>
                  <button onClick={disableAnnonce} disabled={busy === 'disable'} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/80 text-[13px] font-semibold disabled:opacity-50">
                    Retirer des annonces
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11.5px] text-white/45 leading-snug">Étends la visibilité de cet article aux Petites annonces (valable 3 mois, renouvelable).</p>
                <div><span className={lbl}>Catégorie *</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={field + (category ? '' : ' text-white/40')}>
                    <option value="">Choisir…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c} className="text-black">{c}</option>)}
                  </select>
                </div>
                <div><span className={lbl}>Ville *</span><input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Ex : Casablanca" className={field} /></div>
                <div>
                  <span className={lbl}>Position (optionnel)</span>
                  <button onClick={locate} disabled={geoBusy} className={'w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 ' + (lat != null ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30' : 'bg-white/10 text-white/80')}>
                    {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    {geoBusy ? 'Localisation…' : lat != null ? '✓ Position enregistrée' : '📍 Me localiser'}
                  </button>
                </div>
                <button onClick={enableAnnonce} disabled={busy === 'enable'} className="w-full py-3 rounded-xl bg-red-600 text-white text-[14px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {busy === 'enable' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Mettre dans les Petites annonces
                </button>
              </>
            )}
          </div>

          {err && <p className="text-red-400 text-[13px]">{err}</p>}
        </div>
      </div>
    </div>
  );
}
