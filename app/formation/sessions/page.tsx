'use client';
/**
 * « Mes sessions de formation » (Pascal 2026-07-27) — écran VALIDATEUR. Doctrine : c'est le validateur
 * qui OUVRE l'accès à la formation lors de ses sessions, puis CERTIFIE (badge « connaît le taf »).
 * Réservé aux validateurs (403 sinon). Signé : chaque ouverture/certif porte son nom côté serveur.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, MapPin } from '@/lib/icons';
import SanctionPanel from '@/components/gouvernance/SanctionPanel';

interface CohortRow { user_id: string; name: string; session: string | null; opened_at: number; certified: boolean }
interface InboxRow { user_id: string; name: string; username: string | null; sent_by_name: string; city: string | null; created_at: number }
interface Hit { id: string; display_name: string | null; username: string }
interface Sess { id: string; label: string | null; code: string; lat: number | null; lng: number | null; created_at: number; expires_at: number; count: number }
interface Att { user_id: string; name: string; via: string; signed_at: number }

export default function FormationSessionsPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [session, setSession] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [att, setAtt] = useState<Record<string, Att[]>>({});
  const [govUser, setGovUser] = useState<{ id: string; name: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async () => {
    try { const d = await fetch('/api/formation/session', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); if (d?.sessions) setSessions(d.sessions); } catch { /* */ }
  }, []);
  const load = useCallback(async () => {
    const r = await fetch('/api/formation/access?cohort=1', { cache: 'no-store' });
    if (r.status === 403) { setState('forbidden'); return; }
    const d = await r.json(); setCohort(d.cohort || []); setState('ok');
    try { const ir = await fetch('/api/formation/access?inbox=1', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)); setInbox(ir?.inbox || []); } catch { /* */ }
    loadSessions();
  }, [loadSessions]);
  useEffect(() => { load(); }, [load]);

  // Ouvrir une SESSION GÉOLOCALISÉE : ma position ancre le point, les recrutés signeront < 300 m.
  const openSession = () => {
    if (opening) return;
    setOpening(true); setOpenErr(null);
    const post = async (lat: number | null, lng: number | null) => {
      try {
        const d = await fetch('/api/formation/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: session.trim() || undefined, lat, lng }) }).then((r) => r.json());
        if (d?.session) { setSessions((s) => [{ ...d.session, count: 0 }, ...s]); setExpanded(d.session.id); }
        else setOpenErr('Échec de l\'ouverture.');
      } catch { setOpenErr('Échec de l\'ouverture.'); } finally { setOpening(false); }
    };
    if (!navigator.geolocation) { setOpenErr('Ta position est requise pour ancrer la session.'); setOpening(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => post(p.coords.latitude, p.coords.longitude),
      () => { setOpenErr('Active ta position — elle ancre le lieu de la session.'); setOpening(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const toggleAtt = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!att[id]) { try { const d = await fetch(`/api/formation/session?id=${id}`, { cache: 'no-store' }).then((r) => r.json()); setAtt((a) => ({ ...a, [id]: d.attendance || [] })); } catch { /* */ } }
  };

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try { const d = await fetch(`/api/friends/search?q=${encodeURIComponent(v.trim())}`).then((r) => r.json()); setHits((d?.users || []).slice(0, 8)); } catch { setHits([]); }
    }, 250);
  };
  const act = async (userId: string, action: 'open' | 'certify' | 'revoke') => {
    setBusy(true);
    try { const d = await fetch('/api/formation/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action, session: session.trim() || undefined }) }).then((r) => r.json()); if (d?.ok) { setCohort(d.cohort || []); setQ(''); setHits([]); load(); } } catch { /* */ } finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="fixed inset-0 grid place-items-center bg-[#FBFAF8] text-[#6E7480]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (state === 'forbidden') return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6">
      <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-6">← Retour</button>
      <div className="max-w-sm mx-auto text-center pt-16"><div className="text-4xl mb-3">🛡️</div><h1 className="text-[18px] font-extrabold mb-2">Réservé aux validateurs</h1><p className="text-[14px] text-[#6E7480]">Seul un validateur peut ouvrir la formation à des recrutés.</p></div>
    </div>
  );

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6 pb-24">
      <div className="max-w-[640px] mx-auto">
        <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-4">← Retour</button>
        <h1 className="text-[22px] font-extrabold tracking-tight mb-1">Mes sessions de formation</h1>
        <p className="text-[14px] text-[#6E7480] mb-4">Ouvre la formation à tes recrutés, puis certifie-les (« connaît le taf »). Chaque action est signée à ton nom.</p>
        {/* Le FORMATEUR peut ouvrir SON support de cours (le deck des 55 pages) pour réviser / montrer.
            Même carte que « Ma formation » du contributeur (mirroir de FORMATION_CARD_ID de /formation). Pascal 2026-08-08. */}
        <button
          onClick={() => router.push('/card/0371bc49-0c6b-4e4e-b389-8088a8d51969')}
          className="mb-5 w-full text-left rounded-2xl border border-[#ECEAE6] bg-white p-4 hover:border-[#FF7F11] transition-colors">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📖</div>
            <div className="flex-1">
              <div className="text-[15px] font-extrabold text-[#1A1D22]">Voir le support de cours</div>
              <div className="text-[12.5px] text-[#6E7480]">Le cours complet, page par page — pour réviser avant de former tes recrutés.</div>
            </div>
            <div className="text-[#FF7F11] text-lg">→</div>
          </div>
        </button>

        {/* FILE D'ARRIVÉE (routage par zone, Pascal 2026-08-08) : les recrues que des contributeurs de TA
            ville ont envoyées en formation. « Ouvrir l'accès » les fait entrer dans ta cohorte → session → certif. */}
        {inbox.length > 0 && (
          <div className="rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-5">
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">📥</span><h2 className="text-[14px] font-bold flex-1">Recrues à former · {inbox.length}</h2></div>
            <p className="text-[12.5px] text-[#6E7480] mb-3">Des contributeurs de ta zone t&apos;ont envoyé des recrues. Ouvre leur accès pour les intégrer à ta cohorte.</p>
            <div className="flex flex-col gap-2">
              {inbox.map((r) => (
                <div key={r.user_id} className="flex items-center gap-3 rounded-xl border border-[#F1EFEB] p-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#F4F2EE] grid place-items-center font-bold text-[13px] text-[#6E7480] shrink-0">{(r.name || '?')[0].toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold truncate">{r.name}</div>
                    <div className="text-[11.5px] text-[#9AA0A8] truncate">envoyée par {r.sent_by_name}{r.city ? ` · ${r.city}` : ''}</div>
                  </div>
                  <button onClick={() => act(r.user_id, 'open')} disabled={busy} className="shrink-0 rounded-full bg-[#FF7F11] text-white font-semibold text-[12.5px] px-3.5 py-2 disabled:opacity-60">Ouvrir l&apos;accès</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* « Litiges à trancher » RETIRÉ d'ici (Pascal 2026-08-07) : la gouvernance des litiges appartient à
            Mon Parcours, sur la ligne du rôle qui tranche (chef de zone), pas à l'écran de formation. */}

        {/* SESSION GÉOLOCALISÉE — génère l'OTP que les recrutés signent SUR PLACE (garde-fou anti-triche). */}
        <div className="rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-5">
          <div className="flex items-center gap-2 mb-2"><MapPin className="w-4 h-4 text-[#FF7F11]" /><h2 className="text-[14px] font-bold flex-1">Session sur le terrain</h2></div>
          <p className="text-[12.5px] text-[#6E7480] mb-3">Ouvre une session géolocalisée : elle génère un <b>code à 6 chiffres</b> que tes recrutés saisissent <b>sur place</b> pour signer leur présence (leur position doit être à moins de 300 m de la tienne).</p>
          <button onClick={openSession} disabled={opening} className="w-full rounded-lg bg-[#FF7F11] text-white font-semibold text-[14px] py-2.5 disabled:opacity-60">{opening ? 'Position…' : '📍 Ouvrir une session ici'}</button>
          {openErr && <p className="text-[12.5px] text-[#E24C4C] mt-2">{openErr}</p>}
          {sessions.map((s) => {
            const live = s.expires_at > Date.now();
            return (
              <div key={s.id} className="mt-3 rounded-xl border border-[#F1EFEB] p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] text-[#9AA0A8]">{s.label || 'Session'} · {fmtDate(s.created_at)} {live ? '· active' : '· expirée'}</div>
                    <div className="text-[26px] font-extrabold tracking-[0.14em] tabular-nums text-[#1A1D22]">{s.code}</div>
                  </div>
                  <button onClick={() => toggleAtt(s.id)} className="text-[12.5px] font-semibold text-[#FF7F11] px-2 shrink-0">{s.count > 0 ? `${s.count} présent${s.count > 1 ? 's' : ''}` : 'présences'} ›</button>
                </div>
                {expanded === s.id && (
                  <div className="mt-2 border-t border-[#F1EFEB] pt-2">
                    {(att[s.id] || []).length === 0
                      ? <p className="text-[12px] text-[#9AA0A8]">Personne n'a encore signé.</p>
                      : (att[s.id] || []).map((a) => (
                        <div key={a.user_id} className="flex items-center justify-between py-1 text-[13px]">
                          <span>{a.name}</span><span className="text-[11px] text-[#9AA0A8]">{a.via} · {fmtDate(a.signed_at)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-5">
          <label className="text-[13px] font-semibold">Session (optionnel)</label>
          <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Ex : Antananalely · aujourd'hui" className="w-full mt-1.5 mb-3 px-3 py-2.5 rounded-lg border border-[#E3E6EA] text-[14px] outline-none" />
          <label className="text-[13px] font-semibold">Ajouter un recruté</label>
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Nom, identifiant…" className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-[#E3E6EA] text-[14px] outline-none" />
          {hits.map((u) => (
            <div key={u.id} className="flex items-center gap-2 py-2 border-b border-[#F1EFEB] last:border-0">
              <span className="flex-1 text-[13.5px]">{u.display_name || u.username}</span>
              <button onClick={() => act(u.id, 'open')} disabled={busy} className="text-[12.5px] font-semibold text-[#FF7F11] px-2">Ouvrir l'accès</button>
              <button onClick={() => act(u.id, 'certify')} disabled={busy} className="text-[12.5px] font-semibold text-[#12B76A] px-2">Certifier</button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#ECEAE6] bg-white p-4">
          <h2 className="text-[14px] font-bold mb-2">Ma cohorte{cohort.length ? ` · ${cohort.length}` : ''}</h2>
          {cohort.length === 0 && <p className="text-[13px] text-[#9AA0A8]">Personne encore. Ajoute un recruté ci-dessus.</p>}
          {cohort.map((c) => (
            <div key={c.user_id} className="flex items-center gap-2 py-2.5 border-t border-[#F1EFEB] first:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{c.name}</div>
                <div className="text-[11.5px] text-[#9AA0A8]">{c.session || 'sans session'} · ouvert {fmtDate(c.opened_at)}</div>
              </div>
              {c.certified
                ? <span className="text-[11px] font-bold text-[#12B76A] bg-[rgba(18,183,106,.12)] px-2 py-0.5 rounded-full">✓ certifié</span>
                : <button onClick={() => act(c.user_id, 'certify')} disabled={busy} className="text-[12px] font-semibold text-[#12B76A] px-2">Certifier</button>}
              <button onClick={() => setGovUser({ id: c.user_id, name: c.name })} className="text-[15px] px-1" title="Gouvernance — casier & sanctions">⚖️</button>
              <button onClick={() => act(c.user_id, 'revoke')} disabled={busy} className="text-[11.5px] text-[#E24C4C] px-1">Retirer</button>
            </div>
          ))}
        </div>
      </div>
      {govUser && <SanctionPanel userId={govUser.id} name={govUser.name} onClose={() => setGovUser(null)} />}
    </div>
  );
}
