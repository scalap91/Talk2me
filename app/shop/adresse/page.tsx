'use client';

/**
 * Talk2Me — Adresse de livraison UNIVERSELLE (Pascal 2026-08-06).
 * Socle = GPS (marche PARTOUT : Mada comme le reste du monde) + un REPÈRE.
 * L'adresse texte (rue/quartier) est LIBRE et OPTIONNELLE — pour les pays qui ont une voirie.
 * Pas de rue/CP/ville imposés. Le repère + le GPS suffisent au livreur.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ChevronLeft, Check, Loader2, MapPin } from '@/lib/icons';

type Form = {
  label: string; full_name: string; landmark: string; line1: string; phone: string;
  lat: number | null; lng: number | null;
};
const EMPTY: Form = { label: '', full_name: '', landmark: '', line1: '', phone: '', lat: null, lng: null };
const LABELS = ['🏠 Maison', '🏢 Bureau', '📍 Autre'];

export default function AdressePage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [geo, setGeo] = useState<'idle' | 'locating' | 'error'>('idle');

  useEffect(() => {
    fetch('/api/shop/address', { cache: 'no-store' })
      .then((r) => (r.status === 401 ? router.push('/signin') : r.json()))
      .then((d) => { if (d?.address) setForm((s) => ({ ...s, ...d.address })); })
      .catch(() => {});
  }, [router]);

  const set = (k: keyof Form, v: string | number | null) => setForm((s) => ({ ...s, [k]: v }));

  const locate = () => {
    if (!('geolocation' in navigator)) { setGeo('error'); return; }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((s) => ({ ...s, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) })); setGeo('idle'); },
      () => setGeo('error'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    await fetch('/api/shop/address', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const hasGps = form.lat != null && form.lng != null;
  const inputCls = 'mt-1 w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]';

  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] t2m-narrow pb-24 md:pb-6">
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/90 backdrop-blur-xl">
        <button onClick={() => smartBack(router, '/shop')} className="p-1 text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Adresse de livraison</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Label rapide */}
        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Étiquette</label>
          <div className="flex gap-2 mt-1.5">
            {LABELS.map((l) => (
              <button key={l} type="button" onClick={() => set('label', l)}
                className={`px-3 py-1.5 rounded-full text-[13px] border ${form.label === l ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* GPS = socle mondial */}
        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Point de livraison (GPS)</label>
          <button type="button" onClick={locate} disabled={geo === 'locating'}
            className={`mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[14px] font-medium ${hasGps ? 'border-[var(--t2m-primary)] text-[var(--t2m-primary)] bg-[var(--t2m-primary)]/5' : 'border-[var(--t2m-line)] text-[var(--t2m-ink-2)] bg-[var(--t2m-wash)]'}`}>
            {geo === 'locating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {hasGps ? 'Position enregistrée — corriger' : 'Utiliser ma position'}
          </button>
          {hasGps && <p className="mt-1 text-[11px] text-[var(--t2m-ink-3)] font-mono">{form.lat}, {form.lng}</p>}
          {geo === 'error' && <p className="mt-1 text-[11px] text-red-500">Position indisponible — renseigne le repère et l’adresse ci-dessous.</p>}
        </div>

        {/* Repère — clé du dernier kilomètre */}
        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Repère</label>
          <input value={form.landmark} onChange={(e) => set('landmark', e.target.value)}
            placeholder="En face de l’école, portail bleu…" className={inputCls} />
        </div>

        {/* Adresse texte — optionnelle (pays avec voirie) */}
        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Adresse <span className="opacity-60">(optionnelle)</span></label>
          <input value={form.line1} onChange={(e) => set('line1', e.target.value)}
            placeholder="Rue, quartier, ville…" className={inputCls} />
        </div>

        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Destinataire</label>
          <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
            placeholder="Nom de la personne qui reçoit" className={inputCls} />
        </div>

        <div>
          <label className="text-[12px] text-[var(--t2m-ink-3)]">Téléphone</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel"
            placeholder="Pour prévenir à la livraison" className={inputCls} />
        </div>

        <button onClick={save} disabled={saving}
          className="w-full mt-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
        <p className="text-[11px] text-[var(--t2m-ink-3)] text-center pt-1">
          Sert à livrer tes commandes, partout. On ne la partage jamais.
        </p>
      </div>
    </div>
  );
}
