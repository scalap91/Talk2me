'use client';
/**
 * « Mon agence » — tableau de bord AGENCE (début de l'OS agence, Pascal 2026-07-26). Une fois l'agence
 * créée, on ne réaffiche PAS le formulaire : l'agence est résumée sur UNE ligne (✏️ éditer → /devenir-agence,
 * 🗑️ supprimer) et EN DESSOUS les outils pour gérer l'équipe (flotte + chauffeurs) et les colis.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, Package, MapPin } from '@/lib/icons';

interface Profile { cni_status: string; depot: { lat: number; lng: number; label: string | null } | null;
  pricing: { base_cents: number; per_km_cents: number } | null; accepts_parcels: boolean;
  fleet: { type: string }[]; docs: { rcs: boolean; nif: boolean } }

const FR_STATUS: Record<string, string> = { created: 'Créé', at_depot: 'Au dépôt', in_transit: 'En route', ready_for_pickup: 'Prêt à retirer', delivered: 'Remis' };

export default function MonAgence() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('Mon agence');
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<{ id: string; driver_id: string; name: string; avatar: string | null; status: string }[]>([]);
  const [ships, setShips] = useState<Record<string, unknown>[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; avatar: string | null; is_friend: boolean }[]>([]);
  const [adding, setAdding] = useState(false);
  const [dispatchFor, setDispatchFor] = useState<string | null>(null); // id du colis en cours de dispatch
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const searchRef = useRef<number | null>(null);

  const load = async () => {
    const [pr, me, dr, sh] = await Promise.all([
      fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/transport/drivers', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/transport/agency-shipments', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    if (pr?.profile) setProfile(pr.profile);
    if (me?.user) setName(me.user.display_name || me.user.username || 'Mon agence');
    if (dr?.ok) setDrivers(dr.drivers || []);
    if (sh?.ok) setShips((sh.shipments || []) as Record<string, unknown>[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const search = (q: string) => {
    setQuery(q);
    if (searchRef.current) window.clearTimeout(searchRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    searchRef.current = window.setTimeout(async () => {
      try { const d = await fetch('/api/transport/driver-search?q=' + encodeURIComponent(q.trim())).then((r) => r.json()); setResults(d?.users || []); } catch { setResults([]); }
    }, 250);
  };
  const attach = async (id: string) => {
    setBusy(true); setMsg('');
    try { const d = await fetch('/api/transport/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'attach', driver_id: id }) }).then((r) => r.json());
      if (d?.ok) { setDrivers(d.drivers || []); setQuery(''); setResults([]); setAdding(false); setMsg('✅ Demande envoyée — le chauffeur doit valider.'); }
      else setMsg(d?.error === 'already_attached' ? 'Déjà rattaché.' : 'Échec.'); } catch { setMsg('Erreur réseau.'); } finally { setBusy(false); }
  };
  const detach = async (driver_id: string) => {
    try { const d = await fetch('/api/transport/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detach', driver_id }) }).then((r) => r.json()); if (d?.ok) setDrivers(d.drivers || []); } catch { /* */ }
  };
  const dispatch = async (shipmentId: string, driverId: string) => {
    setBusy(true); setMsg('');
    try { const d = await fetch('/api/transport/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dispatch', shipment_id: shipmentId, driver_id: driverId }) }).then((r) => r.json());
      if (d?.ok || d?.shipment) { setDispatchFor(null); setMsg('✅ Colis confié au chauffeur.'); load(); }
      else setMsg('Échec (' + (d?.error || '?') + ').'); } catch { setMsg('Erreur réseau.'); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm('Supprimer ton agence ? Elle disparaît du hub et ne reçoit plus de colis.')) return;
    setBusy(true);
    try { const d = await fetch('/api/transport/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ depot: null, accepts_parcels: false }) }).then((r) => r.json());
      if (d?.ok) router.replace('/profile'); } catch { setMsg('Erreur réseau.'); } finally { setBusy(false); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  // Pas encore d'agence → on renvoie vers la création.
  if (!profile?.depot) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
        <button onClick={() => smartBack(router, '/profile')} className="text-[#8A8F99] text-sm mb-4">← Retour</button>
        <p className="text-[14px] text-[#4A4E57] mb-4">Tu n’as pas encore d’agence.</p>
        <button onClick={() => router.push('/devenir-agence')} className="w-full py-3 rounded-xl bg-amber-500 text-black font-semibold">Devenir agence (dépôt/retrait)</button>
      </div>
    );
  }

  const fmt = (c?: number) => `${(c || 0).toLocaleString('fr-FR')} Ar`;
  const isTransport = profile.fleet?.length > 0 && profile.docs?.rcs && profile.docs?.nif;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-[#8A8F99] text-sm mb-4">← Retour</button>

      {/* Agence résumée sur UNE ligne : ✏️ éditer · 🗑️ supprimer. */}
      <div className="rounded-2xl border border-[#EAECEF] bg-[#F5F6F8] p-3.5 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/25 grid place-items-center shrink-0"><Package className="w-5 h-5 text-amber-600" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{name}</div>
          <div className="text-[12px] text-[#8A8F99] truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.depot.label || 'Dépôt'} · base {fmt(profile.pricing?.base_cents)} + {fmt(profile.pricing?.per_km_cents)}/km{isTransport ? ' · transport' : ''}</div>
        </div>
        <button onClick={() => router.push('/devenir-agence')} className="w-9 h-9 rounded-lg bg-[#F1F3F5] grid place-items-center text-[15px]" title="Éditer">✏️</button>
        <button onClick={del} disabled={busy} className="w-9 h-9 rounded-lg bg-red-500/10 grid place-items-center text-[15px]" title="Supprimer">🗑️</button>
      </div>

      {msg && <p className={'text-[13px] mb-3 ' + (msg.startsWith('✅') ? 'text-emerald-600' : 'text-amber-700')}>{msg}</p>}

      {/* ── MON ÉQUIPE (chauffeurs) ── */}
      <div className="rounded-2xl border border-[#EAECEF] bg-[#F5F6F8] p-4 mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[14px]">Mon équipe{drivers.length ? ` · ${drivers.length}` : ''}</h2>
          {!adding && <button onClick={() => setAdding(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold">➕ Chauffeur</button>}
        </div>
        {adding && (
          <div className="relative">
            <div className="flex items-center gap-2">
              <input autoFocus value={query} onChange={(e) => search(e.target.value)} placeholder="Nom, identifiant ou téléphone…"
                className="flex-1 bg-[#F1F3F5] border border-[#EAECEF] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-amber-400/50" />
              <button onClick={() => { setAdding(false); setQuery(''); setResults([]); }} className="text-[12px] text-[#8A8F99] px-1.5">Fermer</button>
            </div>
            <p className="text-[11px] text-[#9DAAB7] mt-1">Tes amis remontent en premier. Le chauffeur devra valider.</p>
            {results.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#EAECEF] rounded-xl overflow-hidden max-h-64 overflow-y-auto shadow-xl">
                {results.map((u) => (
                  <button key={u.id} onClick={() => attach(u.id)} disabled={busy} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F1F3F5] text-left disabled:opacity-50">
                    {u.avatar ? <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-amber-500/25 grid place-items-center text-[13px] font-semibold text-amber-700 shrink-0">{(u.name[0] || '?').toUpperCase()}</div>}
                    <span className="flex-1 text-[13.5px] text-[#2F343A] truncate">{u.name}</span>
                    {u.is_friend && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 shrink-0">ami</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {drivers.length === 0 && !adding && <p className="text-[12px] text-[#B0B7C0]">Aucun chauffeur. Ajoute ton équipe pour dispatcher tes colis.</p>}
        {drivers.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 text-[13px]">
            {d.avatar ? <img src={d.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-amber-500/25 grid place-items-center text-[14px] font-semibold text-amber-700 shrink-0">{(d.name[0] || '?').toUpperCase()}</div>}
            <span className="flex-1 text-[#2F343A] truncate">{d.name} <span className={'text-[11px] ' + (d.status === 'active' ? 'text-emerald-600' : 'text-amber-600')}>· {d.status === 'active' ? 'actif ✓' : 'en attente'}</span></span>
            <button onClick={() => detach(d.driver_id)} className="text-[11px] text-red-300/70 shrink-0">Retirer</button>
          </div>
        ))}
      </div>

      {/* ── COLIS À GÉRER ── */}
      <div className="rounded-2xl border border-[#EAECEF] bg-[#F5F6F8] p-4 space-y-2">
        <h2 className="font-semibold text-[14px]">Colis{ships.length ? ` · ${ships.length}` : ''}</h2>
        {ships.length === 0 && <p className="text-[12px] text-[#B0B7C0]">Aucun colis à traiter. Les ventes en livraison arrivent ici automatiquement.</p>}
        {ships.slice(0, 30).map((s) => {
          const id = String(s.id); const status = String(s.status);
          const canDispatch = status === 'created' || status === 'at_depot';
          const activeDrivers = drivers.filter((d) => d.status === 'active');
          return (
            <div key={id} className="py-2 border-b border-[#EEF0F3] last:border-0">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] text-[#2F343A] truncate block">{String(s.product_label || 'Colis')}</span>
                  <span className="text-[11px] text-[#9DAAB7]">{String(s.o_label || '')} → {String(s.d_label || '')} · <span className="font-mono text-amber-600/80">{String(s.tracking || '')}</span></span>
                </span>
                {canDispatch
                  ? <button onClick={() => setDispatchFor(dispatchFor === id ? null : id)} disabled={busy} className="shrink-0 text-[12px] px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-50">Dispatcher</button>
                  : <span className="shrink-0 text-[11px] text-[#8A8F99]">{FR_STATUS[status] || status}</span>}
              </div>
              {dispatchFor === id && (
                <div className="mt-2 pl-1 space-y-1">
                  {activeDrivers.length === 0
                    ? <p className="text-[11px] text-[#9DAAB7]">Aucun chauffeur actif. Ajoute/valide un chauffeur dans « Mon équipe ».</p>
                    : activeDrivers.map((d) => (
                      <button key={d.id} onClick={() => dispatch(id, d.driver_id)} disabled={busy} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#EEF1F4] text-left disabled:opacity-50">
                        {d.avatar ? <img src={d.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-amber-500/25 grid place-items-center text-[12px] font-semibold text-amber-700 shrink-0">{(d.name[0] || '?').toUpperCase()}</div>}
                        <span className="flex-1 text-[13px] text-[#2F343A] truncate">Confier à {d.name}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
