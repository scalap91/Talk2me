'use client';
/**
 * Talk2Me — MA FLOTTE (Drive Phase 2 + 3, Pascal 2026-08-10).
 * Phase 2 : on DÉCLARE ses véhicules — cliquer une CATÉGORIE (VEHICLE_CATS = liste unique) ouvre le
 * formulaire (plaque, capacité) → écrit transport_profile.fleet. Porteur IMPLICITE : CNI compte + ≥1 véhicule.
 * Phase 3 : AGENCE IMPLICITE — ajoute un dépôt + tarifs + RCS/NIF + « accepte les colis » → tu apparais
 * dans « Envoyer un colis » et ta vitrine est publiée. Tout via l'API existante PATCH /api/transport/profile.
 * Gate : sans identité vérifiée → renvoi vers Mon Compte (la CNI vit au compte).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, ShieldCheck, MapPin, CheckCircle2, Upload } from '@/lib/icons';
import { VEHICLE_CATS, VEHICLE_MAP } from '@/lib/drive-vehicles';

interface Vehicle { type: string; label?: string; plate?: string; capacity_kg?: number }
interface Profile {
  cni_status: string;
  fleet: Vehicle[];
  depot: { lat: number; lng: number; label: string | null } | null;
  pricing: { base_cents: number; per_km_cents: number } | null;
  accepts_parcels: boolean;
  docs: { rcs: boolean; nif: boolean; statuts: boolean; stat: boolean };
}
const emptyDocs = { rcs: false, nif: false, statuts: false, stat: false };

export default function FleetSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ idx: number; type: string; plate: string; capacity: string } | null>(null);
  // Agence (Phase 3)
  const [depot, setDepot] = useState<{ lat: number; lng: number } | null>(null);
  const [depotLabel, setDepotLabel] = useState('');
  const [priceBase, setPriceBase] = useState('');
  const [pricePerKm, setPricePerKm] = useState('');
  const [acceptsParcels, setAcceptsParcels] = useState(false);
  const [docIds, setDocIds] = useState<{ rcs?: string; nif?: string }>({});
  const [docBusy, setDocBusy] = useState<'rcs' | 'nif' | null>(null);
  const [agencyBusy, setAgencyBusy] = useState(false);
  const [agencyMsg, setAgencyMsg] = useState('');
  const rcsRef = useRef<HTMLInputElement>(null);
  const nifRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const p = d?.profile;
      if (p) {
        setProfile({ cni_status: p.cni_status, fleet: Array.isArray(p.fleet) ? p.fleet : [], depot: p.depot || null, pricing: p.pricing || null, accepts_parcels: !!p.accepts_parcels, docs: p.docs || emptyDocs });
        if (p.depot) { setDepot({ lat: p.depot.lat, lng: p.depot.lng }); setDepotLabel(p.depot.label || ''); }
        if (p.pricing) { setPriceBase(String(p.pricing.base_cents || '')); setPricePerKm(String(p.pricing.per_km_cents || '')); }
        setAcceptsParcels(!!p.accepts_parcels);
      } else setProfile({ cni_status: 'none', fleet: [], depot: null, pricing: null, accepts_parcels: false, docs: emptyDocs });
    }).catch(() => setProfile({ cni_status: 'none', fleet: [], depot: null, pricing: null, accepts_parcels: false, docs: emptyDocs })).finally(() => setLoading(false));
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

  const pinDepot = () => {
    if (!navigator.geolocation) { setAgencyMsg('Géolocalisation indisponible.'); return; }
    setAgencyMsg('Localisation…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setDepot({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setAgencyMsg(''); },
      () => setAgencyMsg('Autorise la localisation.'), { enableHighAccuracy: true, timeout: 12000 });
  };
  const uploadDoc = async (kind: 'rcs' | 'nif', file: File) => {
    setDocBusy(kind); setAgencyMsg('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('side', kind);
      const r = await fetch('/api/transport/cni-upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r?.id) setDocIds((s) => ({ ...s, [kind]: r.id }));
      else setAgencyMsg('Échec de l’envoi (' + (r?.error || 'erreur') + ').');
    } catch { setAgencyMsg('Échec de l’envoi.'); } finally { setDocBusy(null); }
  };
  const saveAgency = async () => {
    if (!depot) { setAgencyMsg('Pose d’abord ton dépôt (« Ma position »).'); return; }
    setAgencyBusy(true); setAgencyMsg('');
    try {
      const body: Record<string, unknown> = {
        depot: { lat: depot.lat, lng: depot.lng, label: depotLabel.trim() },
        pricing: (priceBase || pricePerKm) ? { base_cents: parseInt(priceBase || '0', 10) || 0, per_km_cents: parseInt(pricePerKm || '0', 10) || 0 } : null,
        accepts_parcels: acceptsParcels,
      };
      if (docIds.rcs || docIds.nif) body.docs = docIds;
      const d = await fetch('/api/transport/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
      if (d?.profile) {
        const p = d.profile;
        setProfile((prev) => (prev ? { ...prev, depot: p.depot || null, pricing: p.pricing || null, accepts_parcels: !!p.accepts_parcels, docs: p.docs || prev.docs } : prev));
        const agency = (p.fleet?.length > 0) && p.depot && p.docs?.rcs && p.docs?.nif && p.accepts_parcels;
        setAgencyMsg(agency ? '✅ Tu es une agence — ta page est publiée et tu reçois des colis.' : 'Enregistré. Pour être agence : ≥1 véhicule + dépôt + RCS + NIF + « accepte les colis ».');
      } else setAgencyMsg('Échec, réessaie.');
    } catch { setAgencyMsg('Erreur réseau.'); } finally { setAgencyBusy(false); }
  };

  const status = profile?.cni_status || 'none';
  const fleet = profile?.fleet || [];
  const docs = profile?.docs || emptyDocs;
  const isAgency = fleet.length > 0 && !!profile?.depot && docs.rcs && docs.nif && !!profile?.accepts_parcels;

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

            {/* ── Passer AGENCE (Phase 3) : dépôt + tarifs + RCS/NIF + accepte colis ── */}
            <div className="mt-6 pt-4 border-t border-[#EAECEF]">
              <div className="text-[11px] font-bold uppercase tracking-wide mb-2 text-[#9DAAB7]">🏬 Passer agence — recevoir des colis</div>
              {isAgency && <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 mb-3 text-[13px] text-emerald-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" /> Tu es une agence : ta page est publiée, tu reçois des colis.</div>}
              <p className="text-[12px] text-[#6A7585] mb-3">Un point de dépôt/retrait + tes pièces (RCS, NIF) → tu apparais dans « Envoyer un colis ».</p>

              <label className="text-[13px] text-[#4A4E57]">Dépôt (position + repère)</label>
              <div className="mt-1 flex gap-2">
                <button onClick={pinDepot} className={'shrink-0 rounded-xl border px-3 py-2.5 text-[13px] flex items-center gap-1.5 ' + (depot ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700' : 'border-[#EAECEF] bg-white text-[#4A4E57]')}>
                  {depot ? <CheckCircle2 className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}{depot ? 'Position posée' : 'Ma position'}
                </button>
                <input value={depotLabel} onChange={(e) => setDepotLabel(e.target.value)} placeholder="Repère (ex. face pharmacie)"
                  className="flex-1 min-w-0 bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-amber-400/50" />
              </div>
              {depot && <p className="text-[11px] text-[#9DAAB7] mt-1">📍 {depot.lat.toFixed(5)}, {depot.lng.toFixed(5)}</p>}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><label className="text-[13px] text-[#4A4E57]">Prise en charge (Ar)</label><input value={priceBase} onChange={(e) => setPriceBase(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="3000" className="mt-1 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" /></div>
                <div><label className="text-[13px] text-[#4A4E57]">Prix / km (Ar)</label><input value={pricePerKm} onChange={(e) => setPricePerKm(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="500" className="mt-1 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" /></div>
              </div>

              <button onClick={() => setAcceptsParcels((v) => !v)} className={'mt-3 w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-[14px] ' + (acceptsParcels ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700' : 'border-[#EAECEF] bg-white text-[#4A4E57]')}>
                <span>J’accepte les colis de particuliers</span><span className="text-[16px]">{acceptsParcels ? '✓' : '○'}</span>
              </button>

              <div className="grid grid-cols-2 gap-3 mt-3">
                {([['rcs', 'RCS', rcsRef], ['nif', 'NIF', nifRef]] as const).map(([kind, label, ref]) => {
                  const done = docIds[kind] || docs[kind];
                  return (
                    <div key={kind}>
                      <label className="text-[13px] text-[#4A4E57]">{label} (obligatoire)</label>
                      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(kind, f); }} />
                      <button onClick={() => ref.current?.click()} disabled={docBusy === kind} className={'mt-1 w-full rounded-xl border px-3 py-3 text-[13px] flex items-center justify-center gap-2 ' + (done ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700' : 'border-[#EAECEF] bg-white text-[#4A4E57]')}>
                        {docBusy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}{done ? 'Ajouté' : 'Ajouter'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button onClick={saveAgency} disabled={agencyBusy} className="w-full mt-4 py-3 rounded-xl text-white font-semibold disabled:opacity-60" style={{ background: '#FF7F11' }}>{agencyBusy ? '…' : 'Enregistrer mon agence'}</button>
              {agencyMsg && <p className="text-[12.5px] text-[#6A7585] mt-2">{agencyMsg}</p>}
            </div>
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
