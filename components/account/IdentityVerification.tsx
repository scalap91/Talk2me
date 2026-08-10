'use client';
/**
 * Talk2Me — Vérification d'identité (CNI) = AUTHENTIFICATION DU COMPTE (Pascal 2026-08-10).
 * Demandée UNE seule fois dans Mon Compte ; tout module qui exige une identité vérifiée
 * (transport, agence, encaissement) LIT `cni_status` — zéro formulaire CNI en double.
 * Réutilise l'API EXISTANTE /api/transport/{profile,cni-upload} + colonnes cni_* de transport_profile
 * (rien de recréé). PII air-gap : photos chiffrées, fichiers privés, jamais publiques.
 */
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, CheckCircle2, Clock, XCircle, Upload, Camera, Loader2 } from '@/lib/icons';

type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';
interface Profile { cni_masked: string; cni_status: CniStatus; reject_reason: string | null; full_name?: string | null }

export default function IdentityVerification() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [cni, setCni] = useState('');
  const [frontId, setFrontId] = useState('');
  const [backId, setBackId] = useState('');
  const [selfieId, setSelfieId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [upBusy, setUpBusy] = useState<'front' | 'back' | 'selfie' | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const load = () => {
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.profile) { setProfile(d.profile); setFullName((f) => f || d.profile.full_name || ''); }
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const upload = async (side: 'front' | 'back' | 'selfie', file: File) => {
    setUpBusy(side); setMsg('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('side', side);
      const r = await fetch('/api/transport/cni-upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r?.id) { if (side === 'front') setFrontId(r.id); else if (side === 'back') setBackId(r.id); else setSelfieId(r.id); }
      else setMsg('Échec de l’envoi (' + (r?.error || 'erreur') + ').');
    } catch { setMsg('Échec de l’envoi du fichier.'); } finally { setUpBusy(null); }
  };

  const submit = async () => {
    if (fullName.trim().length < 3) { setMsg('Nom complet (exactement comme sur la CNI) requis.'); return; }
    if (cni.trim().length < 4) { setMsg('Numéro de CNI requis.'); return; }
    if (!frontId || !backId) { setMsg('Ajoute les photos recto ET verso de ta CNI.'); return; }
    if (!selfieId) { setMsg('Prends ta photo (selfie) avec la caméra.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/transport/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, cni_number: cni, front_id: frontId, back_id: backId, selfie_id: selfieId }),
      }).then((x) => x.json());
      if (r?.profile) { setProfile(r.profile); setCni(''); setMsg(''); }
      else setMsg('Erreur : ' + (r?.error || 'inconnue'));
    } finally { setBusy(false); }
  };

  const status = profile?.cni_status || 'none';

  return (
    <div className="px-5 pb-4">
      {status === 'verified' && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div><div className="font-semibold text-emerald-700">Identité vérifiée ✓</div><div className="text-[12px] text-[#6A7585]">CNI {profile?.cni_masked}</div></div>
        </div>
      )}
      {status === 'pending' && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <Clock className="w-6 h-6 text-amber-600 shrink-0" />
          <div><div className="font-semibold text-amber-700">En vérification…</div><div className="text-[12px] text-[#6A7585]">Un validateur contrôle ta CNI. Tu seras notifié.</div></div>
        </div>
      )}
      {(status === 'none' || status === 'rejected') && (
        <div className="space-y-4">
          {status === 'rejected' && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div className="text-[12.5px] text-[#6A7585]"><b className="text-red-600">Refusée.</b> {profile?.reject_reason || 'Document non conforme.'} Corrige et renvoie.</div>
            </div>
          )}
          <p className="text-[12.5px] text-[#6A7585]">Vérifie ton identité une seule fois : elle débloque le transport, l’agence et l’encaissement. Données chiffrées, jamais publiques.</p>
          <div>
            <label className="text-[13px] text-[#4A4E57]">Nom complet (exactement comme sur la CNI)</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="RAKOTO Jean"
              className="mt-1 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
          </div>
          <div>
            <label className="text-[13px] text-[#4A4E57]">Numéro de CNI</label>
            <input value={cni} onChange={(e) => setCni(e.target.value)} placeholder="123 456 789 012"
              className="mt-1 w-full bg-[#F1F3F5] border border-[#EAECEF] rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([['front', 'Recto CNI', frontRef, frontId], ['back', 'Verso CNI', backRef, backId]] as const).map(([side, label, ref, id]) => (
              <div key={side}>
                <label className="text-[13px] text-[#4A4E57]">{label}</label>
                <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(side, f); }} />
                <button onClick={() => ref.current?.click()} disabled={upBusy === side}
                  className={'mt-1 w-full rounded-xl border px-3 py-3 text-[13px] flex items-center justify-center gap-2 ' + (id ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700' : 'border-[#EAECEF] bg-[#F5F6F8] text-[#4A4E57]')}>
                  {upBusy === side ? <Loader2 className="w-4 h-4 animate-spin" /> : id ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {id ? 'Photo ajoutée' : 'Ajouter'}
                </button>
              </div>
            ))}
          </div>
          <div>
            <label className="text-[13px] text-[#4A4E57]">Ta photo (selfie caméra)</label>
            <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('selfie', f); }} />
            <button onClick={() => selfieRef.current?.click()} disabled={upBusy === 'selfie'}
              className={'mt-1 w-full rounded-xl border px-3 py-3 text-[13px] flex items-center justify-center gap-2 ' + (selfieId ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700' : 'border-[#EAECEF] bg-[#F5F6F8] text-[#4A4E57]')}>
              {upBusy === 'selfie' ? <Loader2 className="w-4 h-4 animate-spin" /> : selfieId ? <CheckCircle2 className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              {selfieId ? 'Selfie pris' : 'Prendre mon selfie'}
            </button>
            <p className="text-[11px] text-[#B0B7C0] mt-1">Photo prise en direct avec la caméra (visage bien visible).</p>
          </div>
          <button onClick={submit} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Envoyer pour vérification
          </button>
          {msg && <p className="text-[13px] text-amber-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}
