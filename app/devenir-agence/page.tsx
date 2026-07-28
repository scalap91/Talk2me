'use client';
/**
 * « Devenir agence (dépôt / retrait) » — page PROGRESSIVE (Pascal 2026-07-26). Pensée côté utilisateur :
 *  - LE COMMERÇANT (cas fréquent) : déclare juste son point de dépôt/retrait (position + tarifs + accepte
 *    colis) et s'arrête là. Il ne voit ni flotte ni papiers société tant qu'il ne le demande pas.
 *  - L'AGENCE DE TRANSPORT : après avoir été point de dépôt/retrait, elle choisit explicitement de
 *    « Devenir agence de transport » → flotte + RCS/NIF + chauffeurs (exige un profil transporteur).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, CheckCircle2, Upload, MapPin, Package } from '@/lib/icons';

interface Profile { cni_status: string; depot: { lat: number; lng: number; label: string | null } | null;
  pricing: { base_cents: number; per_km_cents: number } | null; accepts_parcels: boolean;
  fleet: { type: string }[]; docs: { rcs: boolean; nif: boolean; statuts: boolean; stat: boolean } }

const MODES = [
  { key: 'pied', label: 'À pied' }, { key: 'velo', label: 'Vélo' }, { key: 'moto', label: 'Moto' },
  { key: 'scooter', label: 'Scooter' }, { key: 'voiture', label: 'Voiture' }, { key: 'taxibrousse', label: 'Taxi-brousse' },
];

export default function DevenirAgence() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [depot, setDepot] = useState<{ lat: number; lng: number } | null>(null);
  const [depotLabel, setDepotLabel] = useState('');
  const [priceBase, setPriceBase] = useState('');
  const [pricePerKm, setPricePerKm] = useState('');
  const [acceptsParcels, setAcceptsParcels] = useState(false);
  const [fleet, setFleet] = useState<Record<string, boolean>>({});
  const [docs, setDocs] = useState({ rcs: false, nif: false, statuts: false, stat: false });
  const [docIds, setDocIds] = useState<{ rcs?: string; nif?: string; statuts?: string; stat?: string }>({});
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [busyDepot, setBusyDepot] = useState(false);
  const [busyFleet, setBusyFleet] = useState(false);
  const [msg, setMsg] = useState('');
  const [showTransport, setShowTransport] = useState(false); // « Devenir agence de transport » (choix explicite)
  const docRefs = { rcs: useRef<HTMLInputElement>(null), nif: useRef<HTMLInputElement>(null), statuts: useRef<HTMLInputElement>(null), stat: useRef<HTMLInputElement>(null) };

  // Si l'agence a déjà des chauffeurs → elle est déjà en mode transport → on ouvre la section.
  const openIfTransport = async () => {
    try { const d = await fetch('/api/transport/drivers', { cache: 'no-store' }).then((r) => r.json()); if (d?.ok && (d.drivers || []).length) setShowTransport(true); } catch { /* */ }
  };

  useEffect(() => {
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.profile) {
        setProfile(d.profile);
        if (d.profile.depot) { setDepot({ lat: d.profile.depot.lat, lng: d.profile.depot.lng }); setDepotLabel(d.profile.depot.label || ''); }
        if (d.profile.pricing) { setPriceBase(String(d.profile.pricing.base_cents || '')); setPricePerKm(String(d.profile.pricing.per_km_cents || '')); }
        setAcceptsParcels(!!d.profile.accepts_parcels);
        if (Array.isArray(d.profile.fleet) && d.profile.fleet.length) { const f: Record<string, boolean> = {}; d.profile.fleet.forEach((v: { type: string }) => { if (v?.type) f[v.type] = true; }); setFleet(f); setShowTransport(true); }
        if (d.profile.docs) { setDocs(d.profile.docs); if (d.profile.docs.rcs || d.profile.docs.nif) setShowTransport(true); } // déjà engagé côté transport → section ouverte

      }
    }).catch(() => {}).finally(() => setLoading(false));
    openIfTransport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isTransporter = profile?.cni_status === 'verified';
  const isDepot = !!profile?.depot;

  const pinDepot = () => {
    if (!navigator.geolocation) { setMsg('Géolocalisation indisponible.'); return; }
    setMsg('Localisation…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setDepot({ lat: p.coords.latitude, lng: p.coords.longitude }); setMsg(''); },
      () => setMsg('Autorise la localisation pour poser ton dépôt.'), { enableHighAccuracy: true, timeout: 12000 });
  };
  // BLOC 1 — enregistre le point de dépôt/retrait (position + tarifs + accepte colis). Le commerçant s'arrête là.
  const saveDepot = async () => {
    if (!depot) { setMsg('Pose d’abord ton dépôt (bouton « Ma position »).'); return; }
    setBusyDepot(true); setMsg('');
    try {
      const body = {
        depot: { lat: depot.lat, lng: depot.lng, label: depotLabel.trim() },
        pricing: (priceBase || pricePerKm) ? { base_cents: parseInt(priceBase || '0', 10) || 0, per_km_cents: parseInt(pricePerKm || '0', 10) || 0 } : null,
        accepts_parcels: acceptsParcels,
      };
      const r = await fetch('/api/transport/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
      if (r?.profile) { setProfile(r.profile); setMsg('✅ Tu es point de dépôt/retrait.'); }
      else setMsg('Échec, réessaie.');
    } catch { setMsg('Erreur réseau.'); } finally { setBusyDepot(false); }
  };
  // BLOC 2 — enregistre l'agence de transport (flotte + pièces société). Choix explicite.
  const saveFleet = async () => {
    setBusyFleet(true); setMsg('');
    const chosenFleet = Object.keys(fleet).filter((k) => fleet[k]);
    try {
      const r = await fetch('/api/transport/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleet: chosenFleet.map((type) => ({ type })), docs: docIds }) }).then((x) => x.json());
      if (r?.profile) {
        setProfile(r.profile);
        const ok = chosenFleet.length > 0 && r.profile.docs?.rcs && r.profile.docs?.nif;
        setMsg(ok ? '✅ Agence de transport enregistrée — ta page est publiée et tu reçois des colis.'
          : 'Il manque : une flotte + les pièces RCS et NIF pour être agence de transport.');
      } else setMsg('Échec, réessaie.');
    } catch { setMsg('Erreur réseau.'); } finally { setBusyFleet(false); }
  };
  const uploadDoc = async (kind: 'rcs' | 'nif' | 'statuts' | 'stat', file: File) => {
    setDocBusy(kind); setMsg('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('side', kind);
      const r = await fetch('/api/transport/cni-upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r?.id) { setDocIds((s) => ({ ...s, [kind]: r.id })); setDocs((s) => ({ ...s, [kind]: true })); }
      else setMsg('Échec de l’envoi (' + (r?.error || 'erreur') + ').');
    } catch { setMsg('Échec de l’envoi.'); } finally { setDocBusy(null); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-white/50 text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><Package className="w-5 h-5 text-amber-300" /><h1 className="text-xl font-bold">Point de dépôt / retrait</h1></div>
      <p className="text-[13px] text-white/55 mb-5">Deviens un point où l’on dépose et retire des colis. Un commerce comme une agence peut le faire — c’est simple.</p>

      {isDepot && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 mb-4 flex items-center gap-2 text-[13px]"><CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" /><span className="text-emerald-200 font-medium">Tu es point de dépôt/retrait.</span></div>}

      {/* ── BLOC 1 : POINT DE DÉPÔT/RETRAIT (tout le monde) ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-4 space-y-4">
        <div>
          <label className="text-[13px] text-white/70">Dépôt (position + repère)</label>
          <div className="mt-1 flex gap-2">
            <button onClick={pinDepot} className={'shrink-0 rounded-xl border px-3 py-2.5 text-[13px] flex items-center gap-1.5 ' + (depot ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/12 bg-white/[0.04] text-white/70')}>
              {depot ? <CheckCircle2 className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}{depot ? 'Position posée' : 'Ma position'}
            </button>
            <input value={depotLabel} onChange={(e) => setDepotLabel(e.target.value)} placeholder="Repère (ex. face pharmacie Analakely)"
              className="flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-amber-400/50" />
          </div>
          {depot && <p className="text-[11px] text-white/35 mt-1">📍 {depot.lat.toFixed(5)}, {depot.lng.toFixed(5)}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[13px] text-white/70">Prise en charge (Ar)</label>
            <input value={priceBase} onChange={(e) => setPriceBase(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="2500" className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" /></div>
          <div><label className="text-[13px] text-white/70">Prix au km (Ar)</label>
            <input value={pricePerKm} onChange={(e) => setPricePerKm(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="700" className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-amber-400/50" /></div>
        </div>

        <button onClick={() => setAcceptsParcels((v) => !v)} className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="text-[13px] text-white/80 text-left">J’accepte les colis / courrier de particuliers<br /><span className="text-[11px] text-white/45">Un particulier dépose, le destinataire retire avec un code.</span></span>
          <span className={'shrink-0 w-11 h-6 rounded-full transition-colors relative ' + (acceptsParcels ? 'bg-emerald-500' : 'bg-white/15')}><span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (acceptsParcels ? 'left-[22px]' : 'left-0.5')} /></span>
        </button>

        <button onClick={saveDepot} disabled={busyDepot} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold disabled:opacity-50">
          {busyDepot ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {isDepot ? 'Mettre à jour' : 'Devenir point de dépôt/retrait'}
        </button>
      </div>

      {/* ── BLOC 2 : AGENCE DE TRANSPORT (upgrade explicite) ── */}
      {!showTransport ? (
        <button onClick={() => setShowTransport(true)} className="w-full rounded-2xl border border-amber-400/25 bg-amber-500/[0.05] p-4 text-left">
          <div className="text-[14px] font-semibold text-amber-200">Tu transportes toi-même ?</div>
          <div className="text-[12px] text-white/55 mt-0.5">Deviens agence de transport → ajoute ta flotte + tes chauffeurs →</div>
        </button>
      ) : (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold text-amber-200">Agence de transport</div>
            <button onClick={() => setShowTransport(false)} className="text-[11px] text-white/40">masquer</button>
          </div>

          {!isTransporter ? (
            <>
              <p className="text-[12px] text-white/55">Pour transporter des colis toi-même, il te faut d’abord un profil transporteur (CNI + selfie).</p>
              <button onClick={() => router.push('/devenir-transporteur')} className="w-full py-2.5 rounded-xl bg-white/[0.08] text-white font-medium text-[13px]">Créer mon profil transporteur →</button>
            </>
          ) : (
            <>
              <div>
                <label className="text-[12px] text-white/70">Ta flotte</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {MODES.map((m) => (
                    <button key={m.key} onClick={() => setFleet((s) => ({ ...s, [m.key]: !s[m.key] }))}
                      className={'px-3 py-1.5 rounded-full text-[13px] border ' + (fleet[m.key] ? 'bg-amber-500 text-black border-amber-500 font-semibold' : 'border-white/15 text-white/75')}>{m.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12px] text-white/70">Pièces société <span className="text-white/40">(RCS + NIF obligatoires)</span></label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {([['rcs', 'Registre commerce (RCS) *'], ['nif', 'Carte fiscale (NIF) *'], ['statuts', 'Statuts (option)'], ['stat', 'Carte STAT (option)']] as const).map(([k, label]) => (
                    <div key={k}>
                      <input ref={docRefs[k]} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(k, f); }} />
                      <button onClick={() => docRefs[k].current?.click()} disabled={docBusy === k}
                        className={'w-full rounded-lg border px-2.5 py-2.5 text-[11.5px] flex items-center justify-center gap-1.5 ' + (docs[k] ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/12 bg-white/[0.04] text-white/70')}>
                        {docBusy === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : docs[k] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}{label}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-white/45">💡 Tes chauffeurs et tes colis se gèrent depuis <b>« Mon agence »</b>. Ici tu ne fais que le réglage (flotte + papiers).</p>

              <button onClick={saveFleet} disabled={busyFleet} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold disabled:opacity-50">
                {busyFleet ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Enregistrer mon agence de transport
              </button>
            </>
          )}
        </div>
      )}

      {msg && <p className={'text-[13px] mt-3 ' + (msg.startsWith('✅') ? 'text-emerald-300' : 'text-amber-200')}>{msg}</p>}
    </div>
  );
}
