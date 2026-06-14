/**
 * Talk2Me #408b — Dashboard AI Ops dans la Boussole (Pascal 2026-06-05).
 *
 * Verbatim Pascal : "LES RESULTAT DOIVENT APARAITRE DANS LA BOUSSOLE".
 *
 * On déplace ici (sous /schema) le contenu jadis hébergé dans /admin/agents
 * et /admin/patches : les vues admin restent, mais Pascal voit tout depuis la
 * Boussole. La page reste protégée par AI_OPS_ADMIN_EMAILS (PatchQueue =
 * action sensible, on garde l'admin gate).
 *
 * Composé de :
 *   - Snapshot 24h / 7j / 30j (score Léa moyen + missions + coût)
 *   - Courbe trend 30j (LeaTrendChart, recharts dual y-axis)
 *   - Top bugs par type
 *   - Tableau agents avec perf 24h/7j
 *   - Patch queue inline (boutons Approve/Reject réutilisent /api/admin/ai-ops/patch/[id]/...)
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listAgents } from '@/lib/ai-ops/registry';
import {
  totalCostSince,
  countMissionsSince,
} from '@/lib/ai-ops/missions';
import {
  getLeaAvgScoreSince,
  getLeaDailyTrend,
  getBugsGroupedByType,
  getAgentAvgScore,
} from '@/lib/ai-ops/scoring';
import { listPatches } from '@/lib/ai-ops/patch-queue';
import LeaTrendChart from './LeaTrendChart';
import PatchActionsInline from './PatchActionsInline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const dayMs = 24 * 60 * 60 * 1000;

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function SchemaAiOpsPage() {
  const me = await getCurrentUser();
  if (!me || !isAiOpsAdmin(me.id, me.email)) notFound();

  const agents = listAgents();
  const lea24h = getLeaAvgScoreSince(Date.now() - dayMs);
  const lea7d = getLeaAvgScoreSince(Date.now() - 7 * dayMs);
  const lea30d = getLeaAvgScoreSince(Date.now() - 30 * dayMs);
  const missions24h = countMissionsSince(Date.now() - dayMs);
  const missions7d = countMissionsSince(Date.now() - 7 * dayMs);
  const cost24h = totalCostSince(Date.now() - dayMs);
  const cost7d = totalCostSince(Date.now() - 7 * dayMs);
  const trend = getLeaDailyTrend(30);
  const bugsByType = getBugsGroupedByType();
  const pendingPatches = listPatches('pending', 50);
  const reviewedPatches = listPatches(undefined, 20).filter(
    (p) => p.status !== 'pending',
  );

  const agentRows = agents.map((a) => ({
    agent: a,
    avg24h: getAgentAvgScore(a.id, Date.now() - dayMs),
    avg7d: getAgentAvgScore(a.id, Date.now() - 7 * dayMs),
  }));

  return (
    <main className="min-h-[100dvh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link
            href="/schema"
            className="text-white/55 hover:text-white/90 text-[13px]"
          >
            ← Boussole
          </Link>
          <h1 className="text-[15px] font-medium tracking-tight">
            AI Ops · Progression Léa
          </h1>
          <span className="w-12" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Snapshots Léa */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat
            label="Score Léa · 24h"
            value={lea24h.avg !== null ? lea24h.avg.toFixed(2) : '—'}
            sub={`${lea24h.missions} missions`}
            color={scoreColor(lea24h.avg)}
          />
          <Stat
            label="Score Léa · 7j"
            value={lea7d.avg !== null ? lea7d.avg.toFixed(2) : '—'}
            sub={`${lea7d.missions} missions`}
            color={scoreColor(lea7d.avg)}
          />
          <Stat
            label="Score Léa · 30j"
            value={lea30d.avg !== null ? lea30d.avg.toFixed(2) : '—'}
            sub={`${lea30d.missions} missions`}
            color={scoreColor(lea30d.avg)}
          />
          <Stat label="Missions 24h" value={missions24h} />
          <Stat label="Coût 24h" value={`$${cost24h.toFixed(4)}`} />
          <Stat label="Coût 7j" value={`$${cost7d.toFixed(4)}`} />
        </section>

        {/* Courbe trend 30j */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1">
            Progression Léa · 30 derniers jours
          </div>
          <p className="text-[12px] text-white/55 mb-3">
            Score qualité (0–10) sur axe gauche, nombre de missions et coût USD sur axe droit.
            Données issues de <code className="font-mono">agent_perf_daily</code> agrégées par jour.
          </p>
          <LeaTrendChart data={trend} />
        </section>

        {/* Patch queue */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">
                Patch queue · en attente
              </div>
              <p className="text-[12px] text-white/55 mt-0.5">
                Fix Agent propose, Pascal valide. Aucun auto-merge.
              </p>
            </div>
            <span
              className={
                'px-2.5 py-1 rounded-full text-[11px] font-medium ' +
                (pendingPatches.length > 0
                  ? 'bg-amber-500/15 border border-amber-400/30 text-amber-100'
                  : 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-200')
              }
            >
              {pendingPatches.length} en attente
            </span>
          </div>
          {pendingPatches.length === 0 && (
            <p className="text-[12px] text-white/45 py-2">
              Aucun patch en attente. Le Fix Agent n&apos;a rien proposé récemment.
            </p>
          )}
          <div className="space-y-3">
            {pendingPatches.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-white/95 flex items-center gap-2 flex-wrap">
                      <PatchTypeBadge type={p.patch_type} />
                      <code className="text-amber-300 font-mono break-all text-[12px]">
                        {p.target_file || '—'}
                      </code>
                    </div>
                    <div className="text-[11px] text-white/45 mt-1">
                      par <code className="font-mono">{p.proposed_by_agent}</code> ·{' '}
                      {fmt(p.proposed_at)}
                    </div>
                  </div>
                  <PatchActionsInline patchId={p.id} />
                </div>
                <div className="text-[12.5px] text-white/80 mb-2">
                  <span className="text-white/45">Pourquoi : </span>
                  {p.explanation}
                </div>
                {p.expected_improvement && (
                  <div className="text-[12px] text-white/65 mb-2">
                    <span className="text-white/45">Gain attendu : </span>
                    {p.expected_improvement}
                  </div>
                )}
                {p.source_bug_pattern && (
                  <div className="text-[12px] text-white/65 mb-2">
                    <span className="text-white/45">Source bug : </span>
                    {p.source_bug_pattern}
                  </div>
                )}
                <details className="text-[11.5px] mt-2">
                  <summary className="cursor-pointer text-pink-300 hover:text-pink-200">
                    Voir le diff
                  </summary>
                  <pre className="mt-2 p-3 rounded-xl bg-black/40 border border-white/8 text-[10.5px] text-white/85 overflow-x-auto whitespace-pre-wrap">
                    {p.diff}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </section>

        {/* Bugs par type */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">
            Bugs détectés · groupés par type ({bugsByType.length})
          </div>
          {bugsByType.length === 0 && (
            <p className="text-[12px] text-emerald-200/85">
              Aucun bug actif. Tant mieux !
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-left text-white/45 text-[10.5px] uppercase tracking-wider">
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Count</th>
                  <th className="py-2 pr-3 font-medium">Critical</th>
                  <th className="py-2 font-medium">Sample evidence</th>
                </tr>
              </thead>
              <tbody>
                {bugsByType.map((b) => (
                  <tr
                    key={b.bug_type}
                    className="border-t border-white/8 align-top"
                  >
                    <td className="py-2 pr-3 font-medium">{b.bug_type}</td>
                    <td className="py-2 pr-3">{b.count}</td>
                    <td
                      className={
                        'py-2 pr-3 ' +
                        (b.critical_count > 0 ? 'text-red-300' : '')
                      }
                    >
                      {b.critical_count}
                    </td>
                    <td className="py-2 text-white/55 text-[11px] max-w-[420px] truncate">
                      {(b.sample_evidence || '').slice(0, 180)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Agents */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">
            Agents enregistrés ({agents.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-left text-white/45 text-[10.5px] uppercase tracking-wider">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Score 24h</th>
                  <th className="py-2 pr-3 font-medium">Score 7j</th>
                  <th className="py-2 font-medium">Créé</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-3 text-white/45">
                      Aucun agent encore enregistré. Lance le daemon.
                    </td>
                  </tr>
                )}
                {agentRows.map(({ agent, avg24h, avg7d }) => (
                  <tr
                    key={agent.id}
                    className="border-t border-white/8 align-top"
                  >
                    <td className="py-2 pr-3 font-mono text-[10.5px] text-white/85">
                      {agent.id}
                    </td>
                    <td className="py-2 pr-3">
                      <RoleBadge role={agent.role} />
                    </td>
                    <td className="py-2 pr-3 text-white/75">{agent.model}</td>
                    <td className="py-2 pr-3 text-white/55">{agent.status}</td>
                    <td
                      className="py-2 pr-3 font-medium"
                      style={{ color: scoreColor(avg24h) }}
                    >
                      {avg24h !== null ? avg24h.toFixed(1) : '—'}
                    </td>
                    <td
                      className="py-2 pr-3 font-medium"
                      style={{ color: scoreColor(avg7d) }}
                    >
                      {avg7d !== null ? avg7d.toFixed(1) : '—'}
                    </td>
                    <td className="py-2 text-white/45 text-[11px]">
                      {fmt(agent.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Patches reviewés (compact) */}
        {reviewedPatches.length > 0 && (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">
              Patches reviewés (20 derniers)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-left text-white/45 text-[10.5px] uppercase tracking-wider">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Statut</th>
                    <th className="py-2 pr-3 font-medium">Cible</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 font-medium">Pourquoi</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewedPatches.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-white/8 align-top"
                    >
                      <td className="py-2 pr-3 text-white/65">
                        {fmt(p.reviewed_at)}
                      </td>
                      <td
                        className={
                          'py-2 pr-3 font-medium ' +
                          (p.status === 'approved'
                            ? 'text-emerald-300'
                            : 'text-red-300')
                        }
                      >
                        {p.status}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-amber-200/85 break-all">
                        {p.target_file}
                      </td>
                      <td className="py-2 pr-3 text-white/55">{p.patch_type}</td>
                      <td className="py-2 text-white/65 text-[11px] truncate max-w-[380px]">
                        {(p.explanation || '').slice(0, 140)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className="text-[11px] text-white/35 text-center pt-2">
          Dashboard alimenté par le daemon{' '}
          <code className="font-mono">ai-ops-daemon</code> (PM2). Données
          actualisées à chaque chargement de page (pas de cache).
        </p>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div
        className="text-[20px] font-medium"
        style={{ color: color || '#e5e5e5' }}
      >
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-white/45 mt-0.5">{sub}</div>}
    </div>
  );
}

function PatchTypeBadge({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    prompt: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
    regex: 'bg-red-500/20 text-red-200 border-red-400/30',
    code: 'bg-orange-500/20 text-orange-200 border-orange-400/30',
    config: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  };
  const cls = colors[type || ''] || 'bg-white/10 text-white/75 border-white/20';
  return (
    <span
      className={
        'inline-block px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-medium border ' +
        cls
      }
    >
      {type || '—'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    generator: 'bg-blue-500/20 text-blue-200',
    critic: 'bg-red-500/20 text-red-200',
    fix: 'bg-orange-500/20 text-orange-200',
    judge: 'bg-emerald-500/20 text-emerald-200',
    lea: 'bg-pink-500/20 text-pink-200',
    t2m_officiel: 'bg-cyan-500/20 text-cyan-200',
  };
  return (
    <span
      className={
        'inline-block px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-medium ' +
        (colors[role] || 'bg-white/10 text-white/75')
      }
    >
      {role}
    </span>
  );
}

function scoreColor(s: number | null): string {
  if (s === null) return 'rgba(255,255,255,0.55)';
  if (s >= 8) return '#34d399';
  if (s >= 6) return '#fde047';
  if (s >= 4) return '#fb923c';
  return '#f87171';
}
