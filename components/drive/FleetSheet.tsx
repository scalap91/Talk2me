'use client';
/**
 * Talk2Me — MA FLOTTE (Drive Phase 2, Pascal 2026-08-10). On DÉCLARE ses véhicules ici : cliquer une
 * CATÉGORIE (VEHICLE_CATS = liste unique) ouvre le formulaire (plaque, capacité) → écrit
 * transport_profile.fleet (API existante PATCH /api/transport/profile). Devenir porteur/agence est
 * IMPLICITE : CNI du compte vérifiée + ≥1 véhicule ⇒ on peut porter. Gate : sans identité vérifiée →
 * renvoi vers Mon Compte (la CNI vit au compte, pas ici).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, ShieldCheck } from '@/lib/icons';
import { VEHICLE_CATS, VEHICLE_MAP } from '@/lib/drive-vehicles';

interface Vehicle { type: string; label?: string; plate?: string; capacity_kg?: number }
interface Profile { cni_status: string; fleet: Vehicle[] }

export default function FleetSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ idx: number; type: string; plate: string; capacity: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      setProfile(d?.profile ? { cni_status: d.profile.cni_status, fleet: Array.isArray(d.profile.fleet) ? d.profile.fleet : [] } : { cni_status: 'none', fleet: [] });
    }).catch(() => setProfile({ cni_status: 'none', fleet: [] })).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const saveFleet = async (fleet: Vehicle[]) => {
    setSaving(true);
    try {
      const d = await fetch('/api/transport/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fleet }) }).then((r) => r.json());
      if (d?.profile) setProfile((p) => (p ? { ...p, fleet: Array.isArray(d.profile.fleet) ? d.profile.fleet : fleet } : p));
    } finally { setSaving(false); }
  };

  const submitForm = async () => {
    if (!form || !profile) return;
    const v: Vehicle = { type: form.type };
    if (form.plate.trim()) v.plate = form.plate.trim();
    if (Number(form.capacity) > 0) v.capacity_kg = Math.round(Number(form.capacity));
    const fleet = [...profile.fleet];
    if (form.idx >= 0) fleet[form.idx] = v; else fleet.push(v);
    await saveFleet(fleet);
    setForm(null);
  };

  const status = profile?.cni_status || 'none';
  const fleet = profile?.fleet || [];

  return (
    <div className="fixed inset-0 z-[80] bg-[#F5F6F8] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-[#EAECEF]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[#4A4E57]"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold text-[#2F343A]">Ma flotte</h1>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading ? (
          <div className="grid place-items-center py-20 text-[#9DAAB7]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : status !== 'verified' ? (
          <div className="rounded-2xl border border-[#EAECEF] bg-white p-5 text-center">
            <div className="text-[30px] mb-1">🪪</div>
            <div className="text-[15px] font-bold text-[#2F343A]">Vérifie ton identité d’abord</div>
            <p className="text-[12.5px] text-[#6A7585] mt-1 mb-3">Pour porter (une personne ou un colis), ton identité doit être vérifiée — une seule fois, dans Mon Compte.</p>
            <button onClick={() => router.push('/profile')} className="px-5 py-2.5 rounded-xl text-white text-[14px] font-semibold inline-flex items-center gap-2" style={{ background: '#FF7F11' }}><ShieldCheck className="w-4 h-4" /> Aller à Mon Compte</button>
          </div>
        ) : (
          <>
            {fleet.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wide mb-2 text-[#9DAAB7]">Mes véhicules · {fleet.length}</div>
                <div className="flex flex-col gap-2">
                  {fleet.map((v, i) => {
                    const cat = VEHICLE_MAP[v.type];
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#EAECEF]">
                        <span className="text-2xl shrink-0">{cat?.emoji || '🚗'}</span>
                        <button onClick={() => setForm({ idx: i, type: v.type, plate: v.plate || '', capacity: v.capacity_kg ? String(v.capacity_kg) : '' })} className="min-w-0 flex-1 text-left">
                          <div className="text-[14px] font-semibold text-[#2F343A]">{cat?.label || v.type}</div>
                          <div className="text-[11.5px] text-[#9DAAB7]">{v.plate ? v.plate : 'Sans plaque'}{v.capacity_kg ? ` · ${v.capacity_kg} kg` : ''}</div>
                        </button>
                        <button onClick={() => saveFleet(fleet.filter((_, k) => k !== i))} disabled={saving} aria-label="Supprimer" className="w-9 h-9 grid place-items-center rounded-lg text-[16px]">🗑️</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-[11px] font-bold uppercase tracking-wide mb-2 text-[#9DAAB7]">➕ Ajouter un véhicule</div>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_CATS.map((c) => (
                <button key={c.key} onClick={() => setForm({ idx: -1, type: c.key, plate: '', capacity: '' })}
                  className="flex items-center gap-2 p-3 rounded-xl bg-white border border-[#EAECEF] active:scale-95 text-left">
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-[14px] text-[#2F343A]">{c.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-[#9DAAB7] mt-3">Dès qu’un véhicule est déclaré, tu peux te mettre en ligne et recevoir des courses (personne ou colis). Ajoute un dépôt + RCS/NIF pour devenir agence.</p>
          </>
        )}
      </main>

      {form && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-end" onClick={() => setForm(null)}>
          <div className="w-full bg-white rounded-t-2xl p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{VEHICLE_MAP[form.type]?.emoji || '🚗'}</span>
              <h2 className="text-[16px] font-bold text-[#2F343A]">{form.idx >= 0 ? 'Modifier' : 'Ajouter'} · {VEHICLE_MAP[form.type]?.label || form.type}</h2>
            </div>
            <label className="text-[13px] text-[#4A4E57]">Plaque (optionnel)</label>
            <input value={form.plate} onChange={(e) => setForm((f) => (f ? { ...f, plate: e.target.value } : f))} placeholder="1234 TBA"
              className="mt-1 mb-3 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
            <label className="text-[13px] text-[#4A4E57]">Capacité (kg, optionnel)</label>
            <input value={form.capacity} onChange={(e) => setForm((f) => (f ? { ...f, capacity: e.target.value.replace(/[^0-9]/g, '') } : f))} inputMode="numeric" placeholder="200"
              className="mt-1 mb-4 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
            <button onClick={submitForm} disabled={saving} className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60" style={{ background: '#FF7F11' }}>{saving ? '…' : form.idx >= 0 ? 'Enregistrer' : 'Ajouter à ma flotte'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
