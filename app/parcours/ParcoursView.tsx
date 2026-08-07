'use client';

/**
 * Talk2Me — « Mon parcours » (Pascal 2026-07-30).
 * VERTICAL = les niveaux (on monte). Sur la page : le champ de RECHERCHE pour PARRAINER
 * (chercher un inscrit → l'ajouter à ses filleuls). On ne crée rien, pas d'onglet
 * boutiques/transport, pas de calculateur. Cf [[project_talk2me_dashboard_niveaux]].
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ContributorCalculateur from '@/components/contributor/ContributorCalculateur';
import BackButton from '@/components/system/BackButton';
import GouvernanceControls from '@/components/parcours/GouvernanceControls';

interface Level { rank: number; name: string; min_perso: number; min_network: number; min_recruits: number; override_pct: number; territory_max: string }
interface Me { level_rank: number; level: { rank: number; name: string; override_pct: number; territory_max: string } | null; next: Level | null; active: { perso: number; network: number; recruits: number }; window_days: number; recruits_direct: number; earned_cents: number; pending_cents: number; portfolio: Record<string, { n: number; cents: number }>; attached?: { id: string; name: string; kind: string; owner_name: string }[] }
interface Person { id: string; username: string | null; display_name: string | null; avatar_url: string | null; level_rank: number; level_name: string }
interface Data { ok: boolean; is_contributor: boolean; levels: Level[]; parrains: Person[]; filleuls: Person[]; me: Me | null }
interface Hit { id: string; username: string; display_name: string | null }

const MEDALS: Record<number, string> = { 1: '🌱', 2: '🎖️', 3: '🏅', 4: '🏆', 5: '👑' };
const GOV = [
  { rank: 90, name: 'G1 · Validateur', medal: '🛡️', camp: 'Gouvernance', note: 'Local. Juge les litiges & sanctions. Neutre, non commissionné, garde ses contrats, payé pour former. Ouvert par le staff (anti-capture).' },
  { rank: 91, name: 'G2 · Relations institutionnelles', medal: '🤝', camp: 'Gouvernance', note: 'Régional. Partenariats + relations institutionnelles et commerciales. Issu du terrain, neutre.' },
  { rank: 99, name: 'Staff', medal: '🗝️', camp: 'Staff', note: 'National + international : direction, finance, institutions, financement (+ volet solidaire). Nomme les validateurs, ouvre/ferme les droits. Au mérite, réservé aux meilleurs.' },
];
// 3 camps de la formation : 🌾 Terrain (commissionné) · 🛡️ Gouvernance (neutre) · 🏛️ Staff
const CAMPS: Record<string, { emoji: string; color: string; bg: string }> = {
  Terrain: { emoji: '🌾', color: '#0E9F6E', bg: 'rgba(14,159,110,.10)' },
  Gouvernance: { emoji: '🛡️', color: '#1F6FEB', bg: 'rgba(31,111,235,.10)' },
  Staff: { emoji: '🏛️', color: '#8A5CF6', bg: 'rgba(138,92,246,.12)' },
};

const C = { paper: '#F5F4F1', card: '#fff', ink: '#141519', ink2: '#4A4E57', ink3: '#8A8F99', line: '#E6E4DF', line2: '#EDEBE6', money: '#0E9F6E', moneyS: 'rgba(14,159,110,.12)', next: '#C77A0A', nextS: 'rgba(199,122,10,.13)', lock: '#B4B0A8', lockS: '#ECEAE4', gov: '#1F6FEB', govS: 'rgba(31,111,235,.10)' };
const wrap: React.CSSProperties = { maxWidth: 1000, margin: '0 auto', padding: '18px 14px 90px', fontFamily: 'system-ui,-apple-system,sans-serif', color: C.ink, background: C.paper, minHeight: '100vh' };
const cardS: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: '0 1px 2px rgba(20,21,25,.04),0 8px 24px rgba(20,21,25,.06)' };
const btnMoney: React.CSSProperties = { border: 'none', background: C.money, color: '#fff', fontWeight: 800, fontSize: 14, borderRadius: 11, padding: '11px 20px', cursor: 'pointer' };

export default function ParcoursView() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState(1);
  const [joining, setJoining] = useState(false);
  // recherche parrainer
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [parrained, setParrained] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/network/dashboard', { cache: 'no-store' });
    if (r.status === 401) { router.replace('/signin'); return; }
    const j = (await r.json().catch(() => null)) as Data | null;
    if (j?.ok) { setD(j); if (j.me) setSel(j.me.level_rank); }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const join = async () => {
    setJoining(true);
    try {
      const ref = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null;
      await fetch('/api/network/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) });
      await load();
    } finally { setJoining(false); }
  };

  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/friends/search?q=${encodeURIComponent(v.trim())}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        setResults(((j?.users as Hit[]) || []).filter((u) => u.username));
      } finally { setSearching(false); }
    }, 300);
  };

  const parrainer = async (userId: string) => {
    setBusyId(userId);
    try {
      const r = await fetch('/api/network/parrainer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
      const j = await r.json().catch(() => null);
      setParrained((p) => ({ ...p, [userId]: j?.ok ? 'ok' : (j?.reason || 'err') }));
      if (j?.ok) load();
    } finally { setBusyId(''); }
  };

  // Ouvrir la Discussion 1-à-1 avec un parrain / filleul (relationnel).
  const chat = async (userId: string) => {
    try {
      const r = await fetch('/api/conversations/create-p2p', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: userId }) });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.conversation?.id) router.push(`/c/${j.conversation.id}`);
    } catch { /* silencieux */ }
  };

  if (!d) return <div style={wrap}>Chargement…</div>;

  if (!d.is_contributor || !d.me) {
    return (
      <div style={wrap}>
        <div style={{ marginBottom: 10 }}><BackButton label="Retour" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4A4E57] hover:text-[#141519] transition-colors" /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Mon parcours</h1>
        <div style={{ ...cardS, padding: 20, marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🌱</div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: '8px 0 6px' }}>Deviens contributeur</div>
          <p style={{ fontSize: 13.5, color: C.ink3, lineHeight: 1.55, maxWidth: '44ch', margin: '0 auto 16px' }}>Fais entrer les commerces de ta zone, recrute d&apos;autres contributeurs, et monte les échelons.</p>
          <button onClick={join} disabled={joining} style={{ ...btnMoney, opacity: joining ? .6 : 1 }}>{joining ? '…' : 'Devenir contributeur'}</button>
        </div>
      </div>
    );
  }

  const me = d.me;
  const rows = [...d.levels.map((l) => ({ ...l, gov: false, note: '', camp: 'Terrain' })), ...GOV.map((g) => ({ ...g, gov: true, min_perso: 0, min_network: 0, min_recruits: 0, override_pct: null as number | null, territory_max: 'Rôle neutre' }))];
  const statusOf = (rank: number, gov: boolean) => {
    if (gov) return { c: C.gov, s: 'Nomination', bg: C.govS };
    if (rank < me.level_rank) return { c: C.money, s: '✓ Acquis', bg: C.moneyS };
    if (rank === me.level_rank) return { c: C.money, s: '● Actuel', bg: C.moneyS };
    if (rank === me.level_rank + 1) return { c: C.next, s: '⤴ En cours', bg: C.nextS };
    return { c: C.lock, s: '🔒 Verrouillé', bg: C.lockS };
  };
  const selLevel = rows.find((r) => r.rank === sel) || rows[0];
  const st = statusOf(selLevel.rank, selLevel.gov);
  const medal = selLevel.gov ? (selLevel as { medal: string }).medal : (MEDALS[selLevel.rank] || '🎖️');
  const goals: [string, number, number][] = [];
  if (!selLevel.gov && selLevel.rank > me.level_rank) {
    if (selLevel.min_perso) goals.push(['perso', me.active.perso, selLevel.min_perso]);
    if (selLevel.min_network) goals.push(['réseau', me.active.network, selLevel.min_network]);
    if (selLevel.min_recruits) goals.push(['recrues', me.active.recruits, selLevel.min_recruits]);
  }
  const inProgress = selLevel.rank === me.level_rank + 1;
  // Prochaine marche depuis MON grade actuel (vue vers le haut, chiffrée). d.levels porte override_pct + territory_max (me.next ne les a pas).
  const nextLvl = d.levels.find((l) => l.rank === me.level_rank + 1) || null;
  const nextGoals: [string, number, number][] = [];
  if (nextLvl) {
    if (nextLvl.min_perso) nextGoals.push(['perso', me.active.perso, nextLvl.min_perso]);
    if (nextLvl.min_network) nextGoals.push(['réseau', me.active.network, nextLvl.min_network]);
    if (nextLvl.min_recruits) nextGoals.push(['recrues', me.active.recruits, nextLvl.min_recruits]);
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 10 }}><BackButton label="Retour" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4A4E57] hover:text-[#141519] transition-colors" /></div>
      <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0 }}>Mon parcours</h1>
      <p style={{ fontSize: 12.5, color: C.ink3, margin: '4px 0 14px', maxWidth: '60ch', lineHeight: 1.5 }}>Tes niveaux (tu montes en remplissant les défis). Et ici tu <b>parraines</b> : cherche un inscrit, ajoute-le à tes filleuls.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '168px 1fr', gap: 16, alignItems: 'start' }} className="pc-grid">
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 8, position: 'sticky', top: 12 }} className="pc-rail">
          {rows.map((l) => {
            const s = statusOf(l.rank, l.gov);
            const on = l.rank === sel;
            return (
              <button key={l.rank} onClick={() => setSel(l.rank)} style={{ textAlign: 'left', background: C.card, border: `1px solid ${on ? s.c : C.line}`, boxShadow: on ? `0 0 0 2px ${s.bg}` : 'none', borderRadius: 13, padding: '9px 11px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, opacity: s.s.includes('Verrouillé') ? .55 : 1 }}>
                {(() => { const cp = CAMPS[(l as { camp?: string }).camp || 'Terrain']; return <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: cp.color, background: cp.bg, borderRadius: 6, padding: '1px 6px', alignSelf: 'flex-start' }}>{cp.emoji} {(l as { camp?: string }).camp || 'Terrain'}</span>; })()}
                <span style={{ fontSize: 16 }}>{l.gov ? (l as { medal: string }).medal : (MEDALS[l.rank] || '🎖️')}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>{l.name}</span>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: s.c }}>{s.s}</span>
              </button>
            );
          })}
        </div>

        <div style={{ ...cardS, overflow: 'hidden' }}>
          <div style={{ padding: '15px 16px 13px', borderBottom: `1px solid ${C.line2}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26 }}>{medal}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{selLevel.name}<span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.04em', color: st.c, background: st.bg }}>{st.s}</span></div>
              <div style={{ fontSize: 12, color: C.ink3 }}>{selLevel.gov ? selLevel.territory_max : `Niv. ${selLevel.rank} · ${selLevel.territory_max}`}</div>
            </div>
            {selLevel.override_pct != null && <div style={{ marginLeft: 'auto', textAlign: 'right' }}><b style={{ fontSize: 15, color: C.money }}>+{selLevel.override_pct}%</b><div style={{ fontSize: 10.5, color: C.ink3 }}>override</div></div>}
          </div>

          {/* GOUVERNANCE — « Litiges à trancher » déménagé ICI depuis l'écran formation (Pascal 2026-08-07) :
              il vit dans Mon Parcours, sur la ligne du rôle qui tranche (chef de zone / gouvernance). */}
          {selLevel.rank === me.level_rank && (selLevel.gov || /chef/i.test(selLevel.name)) && (
            <button onClick={() => router.push('/gouvernance/litiges')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '11px 16px', borderBottom: `1px solid ${C.line2}`, background: '#fff', border: 'none', cursor: 'pointer', color: '#E24C4C', fontSize: 13, fontWeight: 700 }}>
              ⚖️ Litiges à trancher →
            </button>
          )}

          {selLevel.gov ? (
            <div style={{ padding: '12px 16px', background: C.govS, borderBottom: `1px solid ${C.line2}`, fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>🔒 {(selLevel as { note: string }).note}</div>
          ) : selLevel.rank < me.level_rank ? (
            <div style={{ padding: '10px 16px', background: C.moneyS, borderBottom: `1px solid ${C.line2}`, fontSize: 12, fontWeight: 800, color: C.money }}>✓ Défis remplis — niveau acquis</div>
          ) : selLevel.rank === me.level_rank ? (
            nextLvl ? (
              <div style={{ padding: '11px 16px', background: C.nextS, borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.next, marginBottom: 2 }}>⤴ Prochaine marche : {nextLvl.name}</div>
                <div style={{ fontSize: 11, color: C.ink3, marginBottom: 8 }}>Débloque +{nextLvl.override_pct}% de commission · territoire {nextLvl.territory_max}. Activité mesurée sur {me.window_days} j.</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {nextGoals.map(([k, c, t]) => {
                    const ok = c >= t; const p = t ? Math.min(100, Math.round((c / t) * 100)) : 0;
                    return (
                      <div key={k} style={{ flex: '1 1 120px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}><b>{k}</b><span style={{ color: ok ? C.money : C.ink3 }}>{c}/{t}{ok ? ' ✓' : ` · manque ${t - c}`}</span></div>
                        <div style={{ height: 6, borderRadius: 99, background: C.lockS, overflow: 'hidden' }}><div style={{ height: '100%', width: `${p}%`, background: ok ? C.money : C.next, borderRadius: 99 }} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ padding: '10px 16px', background: C.moneyS, borderBottom: `1px solid ${C.line2}`, fontSize: 12, fontWeight: 800, color: C.money }}>👑 Grade maximum atteint — tu es au sommet.</div>
            )
          ) : (
            <div style={{ padding: '11px 16px', background: C.nextS, borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.next, marginBottom: 8 }}>🎯 Défis à remplir → promotion{inProgress ? '' : ' (après le niveau précédent)'}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {goals.map(([k, c, t]) => {
                  const ok = c >= t; const p = t ? Math.min(100, Math.round((c / t) * 100)) : 0;
                  return (
                    <div key={k} style={{ flex: '1 1 120px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}><b>{k}</b><span style={{ color: ok ? C.money : C.ink3 }}>{inProgress ? c : 0}/{t}{ok ? ' ✓' : ''}</span></div>
                      <div style={{ height: 6, borderRadius: 99, background: C.lockS, overflow: 'hidden' }}><div style={{ height: '100%', width: `${inProgress ? p : 0}%`, background: ok ? C.money : C.next, borderRadius: 99 }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Au-dessus = tes PARRAINS · en dessous = tes FILLEULS (qui, pas leurs gains) → clic = Discussion. */}
          {(() => {
            const above = selLevel.gov || selLevel.rank > me.level_rank;
            const below = !selLevel.gov && selLevel.rank < me.level_rank;
            if (!above && !below) return null;
            const list = above ? (d.parrains || []) : (d.filleuls || []);
            return (
              <div style={{ padding: 16, borderTop: `1px solid ${C.line2}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>{above ? '⬆ Tes parrains' : '⬇ Tes filleuls'}</div>
                {list.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: C.ink3 }}>{above ? 'Personne au-dessus pour l’instant.' : 'Aucun filleul pour l’instant.'}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map((p) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, border: `1px solid ${C.line}`, borderRadius: 12 }}>
                        {p.avatar_url
                          ? <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flex: '0 0 36px' }} />
                          : <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, background: C.govS, color: C.gov, flex: '0 0 36px' }}>{(p.display_name || p.username || '?')[0].toUpperCase()}</span>}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name || p.username || 'Membre'}</div>
                          <div style={{ fontSize: 11.5, color: C.ink3 }}>{p.username ? '@' + p.username + ' · ' : ''}🏅 {p.level_name}</div>
                        </div>
                        <button onClick={() => chat(p.id)} style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink, fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', flex: '0 0 auto' }}>💬 Discuter</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* PARRAINER — seulement sur la ligne Contributeur (rang 1) : les autres grades ne parrainent pas. */}
          {!selLevel.gov && selLevel.rank === 1 && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>👥 Parrainer un inscrit</div>
            <div style={{ position: 'relative', marginBottom: 4 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.ink3, fontSize: 14 }}>🔍</span>
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Chercher un inscrit (nom, @pseudo)…"
                style={{ width: '100%', height: 44, padding: '0 12px 0 34px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.paper, color: C.ink, fontSize: 14, outline: 'none' }} />
            </div>
            {searching && <div style={{ color: C.ink3, fontSize: 12, padding: '6px 2px' }}>Recherche…</div>}
            {!searching && q.trim() && results.length === 0 && <div style={{ color: C.ink3, fontSize: 12, padding: '6px 2px' }}>Aucun inscrit trouvé.</div>}
            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {results.map((u) => {
                  const state = parrained[u.id];
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, border: `1px solid ${C.line}`, borderRadius: 12 }}>
                      <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, background: C.moneyS, color: C.money, flex: '0 0 34px' }}>{(u.display_name || u.username || '?')[0].toUpperCase()}</span>
                      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.display_name || u.username}</div><div style={{ fontSize: 11.5, color: C.ink3 }}>@{u.username}</div></div>
                      {state ? (
                        <span style={{ fontSize: 12, fontWeight: 800, color: state === 'ok' ? C.money : C.ink3, padding: '0 6px' }}>{state === 'ok' ? '✓ Parrainé' : state === 'deja_ton_filleul' ? 'Déjà à toi' : 'Déjà pris'}</span>
                      ) : (
                        <button onClick={() => parrainer(u.id)} disabled={busyId === u.id} style={{ ...btnMoney, padding: '8px 14px', fontSize: 12.5, opacity: busyId === u.id ? .6 : 1 }}>{busyId === u.id ? '…' : 'Parrainer'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Calculateur — seulement sur TA ligne de grade actuel (jamais ailleurs, jamais les gains d'un autre). */}
          {!selLevel.gov && selLevel.rank === me.level_rank && (
          <div style={{ borderTop: `1px solid ${C.line2}`, padding: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>🧮 Calculateur — tes gains réels, lus de tes cards</div>
            <ContributorCalculateur portfolio={me.portfolio} earnedCents={me.earned_cents} pendingCents={me.pending_cents} overridePct={me.level?.override_pct || 0} attached={me.attached || []} />
          </div>
          )}
        </div>
      </div>

      {/* Gouvernance des personnes — déplacé ici depuis l'espace admin (super-admin only, sinon rien). */}
      <div style={{ marginTop: 20 }}><GouvernanceControls /></div>

      <style>{`@media(max-width:720px){.pc-grid{grid-template-columns:1fr!important}.pc-rail{flex-direction:row!important;overflow-x:auto;position:static!important}}`}</style>
    </div>
  );
}
