'use client';

/**
 * Talk2Me — MON ÉQUIPE (Pascal 2026-08-09).
 * La GESTION D'ÉQUIPE, sortie de Mon Parcours (qui redevient l'échelle pure) : on RECRUTE et on
 * fait grandir son équipe. On ne parraine pas en direct → on ENVOIE en formation ; certifiée, la
 * recrue rejoint l'équipe (filleul) — automatiquement, côté serveur. Les recrues EN cours de
 * formation se voient côté FORMATEUR (module Formation), pas ici : ici, mon équipe = mes filleuls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ArrowLeft, Search, Loader2, Share2 } from '@/lib/icons';
import GetAppSheet from '@/components/public/GetAppSheet';

interface Person { id: string; username: string | null; display_name: string | null; avatar_url: string | null; level_rank: number; level_name: string }
interface Hit { id: string; username: string; display_name: string | null }

const C = { page: '#F5F6F8', card: '#ffffff', line: '#EAECEF', ink: '#2F343A', mut: '#6A7585', faint: '#9DAAB7', money: '#0E9F6E', acc: '#FF7F11' };

export default function MonEquipePage() {
  const router = useRouter();
  const [isContrib, setIsContrib] = useState(false);
  const [filleuls, setFilleuls] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [sent, setSent] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Invitation : amener une NOUVELLE personne sur l'app (préalable à « envoyer en formation »).
  const [invite, setInvite] = useState(false);
  const [myUser, setMyUser] = useState('');
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    try {
      setOrigin(window.location.origin);
      const r = await fetch('/api/network/dashboard', { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const j = await r.json().catch(() => null);
      if (j?.ok) { setIsContrib(!!j.is_contributor); setFilleuls(Array.isArray(j.filleuls) ? j.filleuls : []); }
      fetch('/api/auth/me', { cache: 'no-store' }).then((x) => x.json()).then((d) => { if (d?.user?.username) setMyUser(d.user.username); }).catch(() => {});
    } catch { /* */ } finally { setLoading(false); }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try { const j = await fetch(`/api/friends/search?q=${encodeURIComponent(v.trim())}`, { cache: 'no-store' }).then((r) => r.json()); setResults(((j?.users as Hit[]) || []).filter((u) => u.username)); }
      finally { setSearching(false); }
    }, 300);
  };
  // On n'ajoute pas un filleul en direct : on l'ENVOIE en formation. La certif (présence+examen) le rend filleul.
  const envoyer = async (userId: string) => {
    setBusyId(userId);
    try {
      const j = await fetch('/api/network/send-to-formation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) }).then((r) => r.json());
      setSent((p) => ({ ...p, [userId]: j?.ok ? 'ok' : (j?.reason || 'err') }));
    } finally { setBusyId(''); }
  };
  const chat = async (userId: string) => {
    try { const j = await fetch('/api/conversations/create-p2p', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: userId }) }).then((r) => r.json()); if (j?.ok && j.conversation?.id) router.push(`/c/${j.conversation.id}`); } catch { /* */ }
  };

  const avatar = (name: string) => (name || '?')[0].toUpperCase();

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto overflow-hidden" style={{ background: C.page }}>
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => smartBack(router, '/profile')} aria-label="Retour" className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center" style={{ color: C.mut }}><ArrowLeft size={20} /></button>
          <h1 className="text-[18px] font-bold" style={{ color: C.ink }}>Mon équipe</h1>
        </div>

        {!isContrib && !loading ? (
          <div className="rounded-2xl p-5 text-center" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-[30px] mb-1">🤝</div>
            <div className="text-[15px] font-bold" style={{ color: C.ink }}>Deviens contributeur</div>
            <p className="text-[12.5px] mt-1 mb-3" style={{ color: C.mut }}>Pour recruter et faire grandir ton équipe.</p>
            <button onClick={() => router.push('/parcours')} className="px-5 py-2.5 rounded-xl text-white text-[14px] font-semibold" style={{ background: C.money }}>Voir Mon parcours</button>
          </div>
        ) : (
          <>
            {/* RECRUTER — chercher un inscrit → l'envoyer en formation. */}
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: C.faint }}>➕ Recruter</div>
            <p className="text-[12.5px] mb-2" style={{ color: C.mut }}>1. <b>Invite</b> la personne sur l&apos;app. &nbsp;2. Une fois inscrite, <b>envoie-la en formation</b>. &nbsp;3. Certifiée (présence + examen), elle rejoint ton équipe.</p>

            {/* 1) INVITER — amener une NOUVELLE personne sur l'app (sinon rien à envoyer en formation). */}
            <button onClick={() => setInvite(true)} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-white text-[14px] font-semibold mb-3" style={{ background: C.acc }}>
              <Share2 className="w-4 h-4" /> Inviter quelqu&apos;un sur Talk2Me
            </button>

            <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.faint }}>… ou envoie en formation un inscrit existant :</div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Chercher un inscrit (nom, @pseudo)…" className="w-full h-11 pl-9 pr-3 rounded-xl text-[14px] outline-none" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }} />
            </div>
            {searching && <div className="text-[12px] py-1" style={{ color: C.faint }}>Recherche…</div>}
            {!searching && q.trim() && results.length === 0 && <div className="text-[12px] py-1" style={{ color: C.faint }}>Aucun inscrit trouvé.</div>}
            {results.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {results.map((u) => {
                  const s = sent[u.id];
                  return (
                    <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                      <span className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px] shrink-0" style={{ background: 'rgba(255,127,17,.12)', color: C.acc }}>{avatar(u.display_name || u.username)}</span>
                      <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{u.display_name || u.username}</div><div className="text-[11.5px]" style={{ color: C.faint }}>@{u.username}</div></div>
                      {s ? (
                        <span className="text-[12px] font-bold" style={{ color: s === 'ok' ? C.money : C.faint }}>{s === 'ok' ? '✓ En formation' : s === 'deja_ton_filleul' ? 'Déjà à toi' : 'Déjà envoyé'}</span>
                      ) : (
                        <button onClick={() => envoyer(u.id)} disabled={busyId === u.id} className="shrink-0 px-3.5 py-2 rounded-full text-white text-[12.5px] font-semibold disabled:opacity-60" style={{ background: C.money }}>{busyId === u.id ? '…' : '🎓 Envoyer en formation'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MON ÉQUIPE — mes filleuls (downline). Se parler = module Discussion. */}
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2 mt-3" style={{ color: C.faint }}>⬇ Mon équipe · {filleuls.length}</div>
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: C.faint }}><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : filleuls.length === 0 ? (
              <div className="rounded-2xl p-6 text-center" style={{ background: C.card, border: `1px solid ${C.line}` }}><p className="text-[13px]" style={{ color: C.mut }}>Personne dans ton équipe pour l&apos;instant. Recrute quelqu&apos;un ci-dessus.</p></div>
            ) : (
              <div className="flex flex-col gap-2">
                {filleuls.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      : <span className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px] shrink-0" style={{ background: '#EEF2F6', color: C.mut }}>{avatar(p.display_name || p.username || '?')}</span>}
                    <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{p.display_name || p.username || 'Membre'}</div><div className="text-[11.5px]" style={{ color: C.faint }}>{p.username ? '@' + p.username + ' · ' : ''}🏅 {p.level_name}</div></div>
                    <button onClick={() => chat(p.id)} className="shrink-0 px-3 py-2 rounded-xl text-[12.5px] font-semibold" style={{ background: C.page, border: `1px solid ${C.line}`, color: C.ink }}>💬 Discuter</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <GetAppSheet open={invite} onClose={() => setInvite(false)} context="invite" shareUrl={myUser ? `${origin}/r/${myUser}` : undefined} />
    </div>
  );
}
