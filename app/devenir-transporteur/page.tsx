'use client';

/**
 * Talk2Me — Programme Drive/Transport : inscription PORTEUR + CNI (Brique A).
 * Doctrine docs/MODULE_DISTRIBUTION.md §10. Tél + CNI obligatoires AVANT de porter.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, CheckCircle2, Clock, XCircle, Upload, ShieldCheck } from '@/lib/icons';

type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';
interface Profile { phone: string | null; cni_masked: string; cni_status: CniStatus; reject_reason: string | null; modes: string[]; has_photos: boolean }

const MODES: { key: string; label: string }[] = [
  { key: 'pied', label: 'À pied' }, { key: 'velo', label: 'Vélo' }, { key: 'moto', label: 'Moto' },
  { key: 'scooter', label: 'Scooter' }, { key: 'voiture', label: 'Voiture' }, { key: 'taxibrousse', label: 'Taxi-brousse' },
];

export default function DevenirTransporteur() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cni, setCni] = useState('');
  const [modes, setModes] = useState<Record<string, boolean>>({});
  const [frontId, setFrontId] = useState('');
  const [backId, setBackId] = useState('');
  const [videoId, setVideoId] = useState('');
  const [sim, setSim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [upBusy, setUpBusy] = useState<'front' | 'back' | 'video' | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.profile) { setProfile(d.profile); setFullName(d.profile.full_name || ''); setPhone(d.profile.phone || ''); const m: Record<string, boolean> = {}; (d.profile.modes || []).forEach((k: string) => { m[k] = true; }); setModes(m); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const upload = async (side: 'front' | 'back' | 'video', file: File) => {
    setUpBusy(side); setMsg('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('side', side);
      const r = await fetch('/api/transport/cni-upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r?.id) { side === 'front' ? setFrontId(r.id) : side === 'back' ? setBackId(r.id) : setVideoId(r.id); }
      else setMsg('Échec de l’envoi (' + (r?.error || 'erreur') + ').');
    } catch { setMsg('Échec de l’envoi du fichier.'); } finally { setUpBusy(null); }
  };

  const submit = async () => {
    const chosen = Object.keys(modes).filter((k) => modes[k]);
    if (fullName.trim().length < 3) { setMsg('Nom complet (exactement comme sur la CNI) requis.'); return; }
    if (phone.trim().length < 6) { setMsg('Numéro de téléphone requis.'); return; }
    if (cni.trim().length < 4) { setMsg('Numéro de CNI requis.'); return; }
    if (!frontId || !backId) { setMsg('Ajoute les photos recto ET verso de ta CNI.'); return; }
    if (!videoId) { setMsg('Ajoute la vidéo (face + profil gauche + profil droit).'); return; }
    if (!sim) { setMsg('Tu dois attester que la puce est à ton nom.'); return; }
    if (chosen.length === 0) { setMsg('Choisis au moins un moyen de transport.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/transport/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone, cni_number: cni, front_id: frontId, back_id: backId, video_id: videoId, sim_attested: sim, modes: chosen }),
      }).then((x) => x.json());
      if (r?.profile) { setProfile(r.profile); setCni(''); setMsg(''); }
      else setMsg('Erreur : ' + (r?.error || 'inconnue'));
    } finally { setBusy(false); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const status = profile?.cni_status || 'none';

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-white/50 text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-amber-300" /><h1 className="text-xl font-bold">Devenir transporteur</h1></div>
      <p className="text-[13px] text-white/55 mb-5">Programme Drive — porte des colis sur tes trajets. CNI obligatoire (sécurité + traçabilité). Tes données sont chiffrées, ta carte n’est jamais publique.</p>

      {/* Bandeau statut */}
      {status === 'verified' && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 mb-5 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />
          <div><div className="font-semibold text-emerald-200">Vérifié ✓</div><div className="text-[12px] text-white/60">Tu peux accepter des colis. CNI {profile?.cni_masked}</div></div>
        </div>
      )}
      {status === 'pending' && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 mb-5 flex items-center gap-3">
          <Clock className="w-6 h-6 text-amber-300 shrink-0" />
          <div><div className="font-semibold text-amber-200">En vérification…</div><div className="text-[12px] text-white/60">Un admin contrôle ta CNI. Tu seras notifié.</div></div>
        </div>
      )}
      {status === 'rejected' && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 mb-5 flex items-center gap-3">
          <XCircle className="w-6 h-6 text-red-300 shrink-0" />
          <div><div className="font-semibold text-red-200">Refusée</div><div className="text-[12px] text-white/60">{profile?.reject_reason || 'Document non conforme.'} Corrige et renvoie.</div></div>
        </div>
      )}

      {(status === 'none' || status === 'rejected') && (
        <div className="space-y-4">
          <div>
            <label className="text-[13px] text-white/70">Numéro de téléphone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="032 12 345 67"
              className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
          </div>
          <div>
            <label className="text-[13px] text-white/70">Numéro de CNI</label>
            <input value={cni} onChange={(e) => setCni(e.target.value)} placeholder="123 456 789 012"
              className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([['front', 'Recto CNI', frontRef, frontId], ['back', 'Verso CNI', backRef, backId]] as const).map(([side, label, ref, id]) => (
              <div key={side}>
                <label className="text-[13px] text-white/70">{label}</label>
                <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(side, f); }} />
                <button onClick={() => ref.current?.click()} disabled={upBusy === side}
                  className={'mt-1 w-full rounded-xl border px-3 py-3 text-[13px] flex items-center justify-center gap-2 ' + (id ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/12 bg-white/[0.04] text-white/70')}>
                  {upBusy === side ? <Loader2 className="w-4 h-4 animate-spin" /> : id ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {id ? 'Photo ajoutée' : 'Ajouter'}
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="text-[13px] text-white/70">Moyens de transport</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button key={m.key} onClick={() => setModes((s) => ({ ...s, [m.key]: !s[m.key] }))}
                  className={'px-3 py-1.5 rounded-full text-[13px] border ' + (modes[m.key] ? 'bg-amber-500 text-black border-amber-500 font-semibold' : 'border-white/15 text-white/75')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={submit} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Envoyer pour vérification
          </button>
          {msg && <p className="text-[13px] text-amber-200">{msg}</p>}
          <p className="text-[11px] text-white/35 leading-relaxed">En t’inscrivant, tu acceptes de transporter uniquement des colis licites (charte produits interdits). Ton identité (CNI) sert de traçabilité en cas de litige. Tu ne connais pas le contenu des colis scellés.</p>
        </div>
      )}
    </div>
  );
}
