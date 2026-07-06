'use client';
/**
 * OpsPanel — logs & coûts en direct (cockpit T2M, Pascal 2026-06-30). Appelle
 * /api/schema/ops (réservé rôles sensibles). Données réelles, honnête sur le monétaire.
 */
import { useEffect, useState, useCallback } from 'react';

interface ProcInfo { name: string; status: string; cpu: number; memoryMB: number; uptimeH: number; restarts: number }
interface ErrLine { app: string; line: string }
interface DbSize { name: string; mb: number }
interface CostItem { service: string; basis: string; measured: boolean; value?: string; note: string }
interface LlmStats {
  calls: number; tokensIn: number; tokensOut: number; tokensTotal: number;
  todayCalls: number; todayTokensTotal: number;
  byModel: { model: string; calls: number; tokens: number }[];
  bySource: { source: string; calls: number; tokens: number }[];
  rateIn: number; rateOut: number; currency: string; estCost: number; todayCost: number; instrumented: boolean;
}
interface Snap { pm2Ok: boolean; procs: ProcInfo[]; errors: ErrLine[]; dbs: DbSize[]; uploadsMB: number | null; costs: CostItem[]; llm: LlmStats }

const statusColor = (s: string) => s === 'online' ? 'text-emerald-300' : s === 'stopped' || s === 'errored' ? 'text-red-300' : 'text-amber-300';

export default function OpsPanel() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/schema/ops');
      if (res.status === 403 || res.status === 401) { setDenied(true); return; }
      setSnap(await res.json());
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (denied) return <p className="text-[13px] text-white/60">🔒 Réservé aux rôles à paramètres sensibles (admin / infra / paiement).</p>;
  if (!snap) return <p className="text-[13px] text-white/40">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={load} disabled={busy} className="text-[12px] rounded-lg bg-white/[0.06] border border-white/12 px-2.5 py-1 hover:bg-white/[0.12] disabled:opacity-40">
          {busy ? '…' : '↻ Rafraîchir'}
        </button>
      </div>

      {/* Processus PM2 */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Processus (PM2)</h2>
        {!snap.pm2Ok ? <p className="text-[12.5px] text-amber-200/70">PM2 indisponible depuis ce process (commande non joignable).</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-white/45"><tr>
                <th className="text-left px-2 py-1">Process</th><th className="px-2 py-1">Statut</th>
                <th className="px-2 py-1">CPU</th><th className="px-2 py-1">Mém</th><th className="px-2 py-1">Uptime</th><th className="px-2 py-1">Restarts</th>
              </tr></thead>
              <tbody>
                {snap.procs.map((p) => (
                  <tr key={p.name} className="border-t border-white/6">
                    <td className="px-2 py-1 font-medium text-white/85">{p.name}</td>
                    <td className={`px-2 py-1 text-center ${statusColor(p.status)}`}>{p.status}</td>
                    <td className="px-2 py-1 text-center text-white/60">{p.cpu}%</td>
                    <td className="px-2 py-1 text-center text-white/60">{p.memoryMB} Mo</td>
                    <td className="px-2 py-1 text-center text-white/60">{p.uptimeH} h</td>
                    <td className={`px-2 py-1 text-center ${p.restarts > 20 ? 'text-amber-300' : 'text-white/60'}`}>{p.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dernières erreurs */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Dernières erreurs (logs)</h2>
        {snap.errors.length === 0 ? <p className="text-[12.5px] text-emerald-200/70">Aucune erreur récente dans les logs. 🟢</p> : (
          <div className="space-y-1 font-mono text-[11px] max-h-72 overflow-y-auto">
            {snap.errors.map((e, i) => (
              <div key={i} className="flex gap-2 border-t border-white/5 pt-1 first:border-0 first:pt-0">
                <span className="text-violet-300/70 shrink-0">{e.app}</span>
                <span className="text-red-200/70 break-all">{e.line}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stockage (bases) */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Stockage — bases ({snap.dbs.length})</h2>
        {snap.dbs.length === 0 ? <p className="text-[12.5px] text-white/40">Aucune base détectée.</p> : (
          <div className="grid sm:grid-cols-2 gap-1.5 text-[12px]">
            {snap.dbs.map((d) => (
              <div key={d.name} className="flex justify-between border-b border-white/5 pb-0.5">
                <code className="text-white/70">{d.name}</code><span className="text-white/55">{d.mb} Mo</span>
              </div>
            ))}
          </div>
        )}
        {snap.uploadsMB !== null && <p className="text-[12px] text-white/55 mt-2">Médias (uploads) : <b className="text-white/80">{snap.uploadsMB} Mo</b></p>}
      </section>

      {/* LLM — tokens & coût (instrumenté) */}
      <section className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">LLM — tokens &amp; coût (réel)</h2>
        {!snap.llm.instrumented ? (
          <p className="text-[12.5px] text-white/55">Instrumentation active — en attente du 1er appel LLM (envoie un message à Léa).</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                <div className="text-[16px] font-semibold">{snap.llm.todayTokensTotal.toLocaleString('fr')}</div>
                <div className="text-[10.5px] text-white/45">tokens aujourd&apos;hui</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                <div className="text-[16px] font-semibold">~{snap.llm.todayCost} {snap.llm.currency}</div>
                <div className="text-[10.5px] text-white/45">coût aujourd&apos;hui</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                <div className="text-[16px] font-semibold">{snap.llm.tokensTotal.toLocaleString('fr')}</div>
                <div className="text-[10.5px] text-white/45">tokens cumul ({snap.llm.calls} appels)</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                <div className="text-[16px] font-semibold">~{snap.llm.estCost} {snap.llm.currency}</div>
                <div className="text-[10.5px] text-white/45">coût cumul</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/55">
              <span>↓ in {snap.llm.tokensIn.toLocaleString('fr')}</span>
              <span>↑ out {snap.llm.tokensOut.toLocaleString('fr')}</span>
              {snap.llm.bySource.map((s) => <span key={s.source}><code className="text-violet-200/70">{s.source}</code> {s.tokens.toLocaleString('fr')} tok</span>)}
              {snap.llm.byModel.map((m) => <span key={m.model}><code className="text-white/50">{m.model}</code></span>)}
            </div>
            <p className="text-[10.5px] text-white/35 mt-2">Tokens RÉELS (champ <code>usage</code> de l&apos;API). Coût = tokens × tarif déclaré {snap.llm.rateIn}/{snap.llm.rateOut} {snap.llm.currency} par 1M (in/out, éditable via env <code>LLM_PRICE_*</code>).</p>
          </>
        )}
      </section>

      {/* Coûts */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Coûts</h2>
        <p className="text-[11.5px] text-white/40 mb-3">🟢 mesuré en direct · ⚪ non instrumenté (aucun chiffre inventé — doctrine grounding).</p>
        <div className="space-y-2">
          {snap.costs.map((c) => (
            <div key={c.service} className="flex items-start justify-between gap-3 border-t border-white/6 pt-2 first:border-0 first:pt-0">
              <div className="min-w-0">
                <div className="text-[13px] text-white/85">{c.measured ? '🟢' : '⚪'} {c.service}</div>
                <div className="text-[11px] text-white/40">{c.basis} — {c.note}</div>
              </div>
              <div className="text-[13px] text-white/80 shrink-0">{c.value ?? '—'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
