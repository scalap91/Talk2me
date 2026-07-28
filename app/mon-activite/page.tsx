'use client';

/**
 * Talk2Me — « Mon activité » contributeur (Pascal 2026-06-20).
 * Bottom-up : si pas contributeur → CTA « Devenir contributeur ». Sinon → échelon,
 * progression vers le niveau suivant, scores, commissions, réseau, lien de parrainage,
 * et journal des contributions récentes.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ArrowLeft, TrendingUp, Users, Coins, Trophy, Loader2, Share2, Check } from '@/lib/icons';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';

interface Stats {
  contributor: { level_rank: number; personal_score: number; network_score: number; recruits_count: number };
  level: { rank: number; name: string; override_pct: number; territory_max: string } | null;
  next: { rank: number; name: string; min_perso: number; min_network: number; min_recruits: number } | null;
  active: { perso: number; network: number; recruits: number }; window_days: number;
  month_rank: number; month_total: number;
  earned_cents: number; pending_cents: number; recruits_direct: number;
  recent: Array<{ type_code: string; service: string; target_label: string | null; commission_cents: number; created_at: number }>;
}
const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';
const pct = (v: number, max: number) => Math.min(100, max > 0 ? Math.round((v / max) * 100) : (v > 0 ? 100 : 0));

export default function MonActivitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isContrib, setIsContrib] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [myRef, setMyRef] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [casier, setCasier] = useState<{ churn: number; reports: number; refunds: number; litiges: number; score: number; health: 'green' | 'orange' | 'red'; suggested: number; sanction: { level: number; reason: string } | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/network/me', { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const d = await r.json();
      if (d?.ok) { setIsContrib(d.is_contributor); setStats(d.stats); setMyRef(d.my_ref || ''); }
    } finally { setLoading(false); }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const join = async () => {
    setJoining(true);
    try {
      const ref = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null;
      const r = await fetch('/api/network/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
      });
      if (r.ok) await load();
    } finally { setJoining(false); }
  };

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/mon-activite?ref=${myRef}` : '';
  const invite = async () => {
    try {
      if (navigator.share) await navigator.share({ url: shareLink, title: 'Rejoins-moi sur Talk2Me' });
      else { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* annulé */ }
  };

  useEffect(() => {
    fetch('/api/casier', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.casier) setCasier(d.casier); }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-[100svh] t2m-page bg-background overflow-hidden">
      <ChatHeader />
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => smartBack(router, '/profile')} aria-label="Retour" className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-white/80 hover:bg-white/[0.08]"><ArrowLeft size={20} /></button>
          <TrendingUp className="w-5 h-5 text-emerald-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Mon activité</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-white/50"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : !isContrib || !stats ? (
          // ── CTA Devenir contributeur ──
          <div className="text-center py-8 px-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-3xl mb-4">🚀</div>
            <h2 className="text-white text-[19px] font-semibold mb-2">Deviens contributeur</h2>
            <p className="text-white/55 text-[13.5px] leading-relaxed max-w-xs mx-auto mb-6">
              Aide les commerces de ton quartier à se développer sur Talk2Me (fiches, photos, clients),
              recrute d&apos;autres contributeurs, et <b className="text-white/80">gagne une part</b> sur ce que tu génères.
              Tu montes les échelons selon ce que tu accomplis.
            </p>
            <button onClick={join} disabled={joining} className="px-6 h-12 rounded-full bg-emerald-600 text-white text-[15px] font-semibold active:scale-95 disabled:opacity-50 inline-flex items-center gap-2">
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Devenir contributeur
            </button>
          </div>
        ) : (
          <>
            {/* Échelon + progression */}
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 mb-4">
              <div className="flex items-center gap-2 text-emerald-200/80 text-[11px] uppercase tracking-wider"><Trophy size={13} /> Échelon</div>
              <div className="text-[26px] font-semibold text-white mt-1 leading-none">{stats.level?.name || 'Contributeur'}</div>
              {stats.level && <div className="text-[12px] text-white/45 mt-1">Override réseau {stats.level.override_pct}% · zone max : {stats.level.territory_max}</div>}
              {stats.next ? (
                <div className="mt-3">
                  <div className="text-[12px] text-white/55 mb-1.5">Vers <b className="text-white/80">{stats.next.name}</b> <span className="text-white/40">· activité {stats.window_days} j (à maintenir)</span></div>
                  <Bar label="Perso" v={stats.active.perso} max={stats.next.min_perso} />
                  <Bar label="Réseau" v={stats.active.network} max={stats.next.min_network} />
                  <Bar label="Recrues" v={stats.active.recruits} max={stats.next.min_recruits} />
                </div>
              ) : <div className="text-[12px] text-emerald-300 mt-2">Échelon maximum atteint 🏆 — à maintenir sur {stats.window_days} j</div>}
            </div>

            {/* CHALLENGE du mois (motivation) */}
            {stats.month_rank > 0 && (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4 mb-4 flex items-center gap-3">
                <div className="text-2xl">{stats.month_rank === 1 ? '👑' : '🔥'}</div>
                <div className="min-w-0">
                  <div className="text-[14px] text-white/95 font-medium">
                    {stats.month_rank === 1 ? 'Meilleur contributeur du mois !' : `${stats.month_rank}ᵉ ce mois-ci`}
                    <span className="text-white/45 font-normal"> · sur {stats.month_total}</span>
                  </div>
                  <div className="text-[12px] text-amber-200/80">{stats.month_rank === 1 ? 'Garde ta place 💪' : 'Monte au classement — chaque action compte.'}</div>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <Kpi icon={<Coins size={15} />} label="Gagné" value={eur(stats.earned_cents)} />
              <Kpi icon={<Coins size={15} />} label="En attente" value={eur(stats.pending_cents)} />
              <Kpi icon={<Users size={15} />} label="Recrues" value={String(stats.recruits_direct)} />
            </div>

            {/* MON CASIER (Pascal 2026-07-27) — la data qui juge sur les FAITS. Le mérite fait monter, les résultats font tomber. */}
            {casier && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-white/70 text-[11px] uppercase tracking-wider">🛡️ Mon casier</div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${casier.health === 'green' ? 'bg-emerald-500/15 text-emerald-300' : casier.health === 'orange' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>
                    {casier.health === 'green' ? '✓ Bon' : casier.health === 'orange' ? 'À surveiller' : '⚠ Alerte'}
                  </span>
                </div>
                <p className="text-[11.5px] text-white/45 mb-3 leading-relaxed">Tes résultats, pas ta parole. Le mérite fait monter — les résultats font tomber.</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([['Churn', casier.churn], ['Plaintes', casier.reports], ['Rembours.', casier.refunds], ['Litiges', casier.litiges]] as [string, number][]).map(([lbl, v]) => (
                    <div key={lbl} className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5">
                      <div className={`text-[19px] font-semibold leading-none ${v > 0 ? 'text-white/95' : 'text-white/35'}`}>{v}</div>
                      <div className="text-[10.5px] text-white/45 mt-1">{lbl}</div>
                    </div>
                  ))}
                </div>
                {casier.sanction ? (
                  <div className="mt-3 rounded-xl bg-red-500/10 border border-red-400/30 px-3 py-2 text-[12px] text-red-200">⚠ <b>Sanction active — niveau {casier.sanction.level}</b> : {casier.sanction.reason}</div>
                ) : casier.suggested > 0 ? (
                  <div className="mt-3 text-[11.5px] text-amber-200/80">La data appelle un <b>niveau {casier.suggested}</b> — redresse tes résultats avant qu&apos;un validateur ne tranche.</div>
                ) : null}
              </div>
            )}

            {/* Lien de parrainage */}
            <button onClick={invite} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between hover:bg-white/[0.06] mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/25 grid place-items-center text-emerald-300">{copied ? <Check size={17} /> : <Share2 size={17} />}</div>
                <div className="text-left"><div className="text-[14px] text-white/95 font-medium">Inviter / recruter</div><div className="text-[12px] text-white/55">{copied ? 'Lien copié' : 'Partage ton lien → ton réseau grandit'}</div></div>
              </div>
              <span className="text-white/40">›</span>
            </button>

            {/* Journal */}
            <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Mes contributions récentes</div>
            {stats.recent.length === 0 ? (
              <p className="text-white/35 text-[13px] py-6 text-center">Aucune contribution pour l&apos;instant. Aide un commerce de ton quartier 👆</p>
            ) : (
              <div className="space-y-2">
                {stats.recent.map((r, i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-[13px] text-white/90 truncate">{r.target_label || r.type_code}</div>
                      <div className="text-[11px] text-white/45">{r.service}</div>
                    </div>
                    {r.commission_cents > 0 && <span className="text-[12.5px] font-semibold text-emerald-300 shrink-0 ml-2">+{eur(r.commission_cents)}</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-white/35 mt-4 leading-relaxed">Les commissions sont réelles : elles proviennent de tes contributions. Le versement passe par ton portefeuille.</p>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function Bar({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[11px] text-white/45 mb-0.5"><span>{label}</span><span>{v}{max > 0 ? ` / ${max}` : ''}</span></div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: pct(v, max) + '%' }} /></div>
    </div>
  );
}
function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
      <div className="text-white/45 flex justify-center mb-1">{icon}</div>
      <div className="text-[15px] font-semibold text-white/95 leading-tight">{value}</div>
      <div className="text-[10.5px] text-white/45 mt-0.5">{label}</div>
    </div>
  );
}
