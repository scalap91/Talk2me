/**
 * Talk2Me Admin Dashboard Agents #406+#407 (Pascal 2026-06-05).
 *
 * Dashboard de performance des agents IA (Generator/Critic/Fix/Judge/Léa).
 * "comme des bons ouvriers qui apprennent leur taf" — verbatim Pascal #407.
 *
 * Server Component, accès Pascal via AI_OPS_ADMIN_EMAILS.
 */

import { getCurrentUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listAgents } from '@/lib/ai-ops/registry';
import {
  totalCostSince,
  countMissionsSince,
  listRecentMissions,
} from '@/lib/ai-ops/missions';
import {
  getRecentBugs,
  getBugsGroupedByType,
  getPerfDailyRange,
  getAgentAvgScore,
} from '@/lib/ai-ops/scoring';
import { countPending } from '@/lib/ai-ops/patch-queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const dayMs = 24 * 60 * 60 * 1000;

export default async function AiOpsAgentsPage() {
  const me = await getCurrentUser();
  if (!me || !isAiOpsAdmin(me.id, me.email)) notFound();

  const agents = listAgents();
  const missions24h = countMissionsSince(Date.now() - dayMs);
  const missions7d = countMissionsSince(Date.now() - 7 * dayMs);
  const cost24h = totalCostSince(Date.now() - dayMs);
  const cost7d = totalCostSince(Date.now() - 7 * dayMs);
  const pendingPatches = countPending();
  const recentMissions = listRecentMissions(30);
  const recentBugs = getRecentBugs(30);
  const bugsByType = getBugsGroupedByType();
  const perfDaily = getPerfDailyRange(7);

  const agentScores = agents.map((a) => ({
    agent: a,
    avg7d: getAgentAvgScore(a.id, Date.now() - 7 * dayMs),
    avg24h: getAgentAvgScore(a.id, Date.now() - dayMs),
  }));

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'ui-sans-serif, system-ui',
        maxWidth: 1400,
        margin: '0 auto',
        color: '#e5e5e5',
        background: '#0a0a0a',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        AI Ops — Agent Performance #407
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Verbatim Pascal : "le module enregistre le score de nos agent en fonction des objectifs et des tâches qu'ils doivent accomplir comme des bons ouvriers qui apprennent leur taf"
        <br />
        Doctrine [[feedback-roles-via-agents]] · [[feedback-modular-no-scattered-patches]] · {' '}
        <a href="/admin/patches" style={{ color: '#a78bfa' }}>
          Patches en attente ({pendingPatches})
        </a>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}>
        <Stat label="Agents actifs" value={agents.filter((a) => a.status === 'active').length} />
        <Stat label="Missions 24h" value={missions24h} />
        <Stat label="Missions 7j" value={missions7d} />
        <Stat label="Coût 24h" value={`$${cost24h.toFixed(4)}`} />
        <Stat label="Coût 7j" value={`$${cost7d.toFixed(4)}`} />
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Agents enregistrés ({agents.length})</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={trHead}>
              <th style={th}>Agent ID</th>
              <th style={th}>Role</th>
              <th style={th}>Model</th>
              <th style={th}>Prompt Hash</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Score 24h</th>
              <th style={th}>Score 7j</th>
            </tr>
          </thead>
          <tbody>
            {agentScores.length === 0 && (
              <tr>
                <td style={td} colSpan={8}>Aucun agent encore enregistré. Lance le daemon.</td>
              </tr>
            )}
            {agentScores.map(({ agent, avg7d, avg24h }) => (
              <tr key={agent.id} style={trBody}>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{agent.id}</td>
                <td style={td}>
                  <span style={roleBadge(agent.role)}>{agent.role}</span>
                </td>
                <td style={td}>{agent.model}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 10 }}>
                  {agent.system_prompt_hash?.slice(0, 8) || '—'}
                </td>
                <td style={td}>{agent.status}</td>
                <td style={td}>{fmt(agent.created_at)}</td>
                <td style={{ ...td, color: scoreColor(avg24h) }}>{avg24h !== null ? avg24h.toFixed(1) : '—'}</td>
                <td style={{ ...td, color: scoreColor(avg7d) }}>{avg7d !== null ? avg7d.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Perf journalière (7 derniers jours)</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={trHead}>
              <th style={th}>Date</th>
              <th style={th}>Agent</th>
              <th style={th}>Missions</th>
              <th style={th}>Failed</th>
              <th style={th}>Avg score</th>
              <th style={th}>Cost USD</th>
            </tr>
          </thead>
          <tbody>
            {perfDaily.length === 0 && (
              <tr><td style={td} colSpan={6}>Aucune perf agrégée encore.</td></tr>
            )}
            {perfDaily.map((p) => (
              <tr key={p.agent_id + p.date} style={trBody}>
                <td style={td}>{p.date}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{p.agent_id.slice(0, 16)}</td>
                <td style={td}>{p.missions_count}</td>
                <td style={{ ...td, color: p.missions_failed > 0 ? '#ef4444' : undefined }}>
                  {p.missions_failed}
                </td>
                <td style={{ ...td, color: scoreColor(p.avg_score) }}>
                  {p.avg_score !== null ? p.avg_score.toFixed(2) : '—'}
                </td>
                <td style={td}>${p.total_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Bugs détectés par type ({bugsByType.length})</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={trHead}>
              <th style={th}>Type</th>
              <th style={th}>Count</th>
              <th style={th}>Critical</th>
              <th style={th}>Sample evidence</th>
            </tr>
          </thead>
          <tbody>
            {bugsByType.length === 0 && (
              <tr><td style={td} colSpan={4}>Aucun bug détecté. Tant mieux !</td></tr>
            )}
            {bugsByType.map((b) => (
              <tr key={b.bug_type} style={trBody}>
                <td style={td}>{b.bug_type}</td>
                <td style={td}>{b.count}</td>
                <td style={{ ...td, color: b.critical_count > 0 ? '#ef4444' : undefined }}>{b.critical_count}</td>
                <td style={{ ...td, color: '#888', fontSize: 11 }}>{(b.sample_evidence || '').slice(0, 120)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Missions récentes (30)</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={trHead}>
              <th style={th}>Started</th>
              <th style={th}>Role</th>
              <th style={th}>Agent</th>
              <th style={th}>Status</th>
              <th style={th}>Tokens</th>
              <th style={th}>USD</th>
              <th style={th}>Output excerpt</th>
            </tr>
          </thead>
          <tbody>
            {recentMissions.map((m) => (
              <tr key={m.id} style={trBody}>
                <td style={td}>{fmt(m.started_at)}</td>
                <td style={td}>
                  <span style={roleBadge(m.role)}>{m.role}</span>
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 10 }}>{m.agent_id.slice(0, 14)}</td>
                <td style={{ ...td, color: m.status === 'failed' || m.status === 'timeout' ? '#ef4444' : '#10b981' }}>
                  {m.status}
                </td>
                <td style={td}>{m.cost_tokens}</td>
                <td style={td}>${m.cost_usd.toFixed(5)}</td>
                <td style={{ ...td, color: '#888', fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(m.output || '').slice(0, 140)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Bugs récents (30)</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={trHead}>
              <th style={th}>Detected</th>
              <th style={th}>Type</th>
              <th style={th}>Severity</th>
              <th style={th}>Fix category</th>
              <th style={th}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {recentBugs.length === 0 && (
              <tr><td style={td} colSpan={5}>Aucun bug récent.</td></tr>
            )}
            {recentBugs.map((b) => (
              <tr key={b.id} style={trBody}>
                <td style={td}>{fmt(b.detected_at)}</td>
                <td style={td}>{b.bug_type}</td>
                <td style={{ ...td, color: severityColor(b.severity) }}>{b.severity}</td>
                <td style={td}>{b.suggested_fix_category || '—'}</td>
                <td style={{ ...td, color: '#888', fontSize: 11 }}>{(b.evidence || '').slice(0, 200)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const trHead: React.CSSProperties = { borderBottom: '1px solid #333' };
const trBody: React.CSSProperties = { borderBottom: '1px solid #1f1f1f' };
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: '#aaa', fontWeight: 500 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: string }) {
  return (
    <div style={{ background: '#141414', borderRadius: 8, padding: 12, border: '1px solid #222' }}>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, color: highlight || '#e5e5e5', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function scoreColor(s: number | null): string | undefined {
  if (s === null) return undefined;
  if (s >= 8) return '#10b981';
  if (s >= 6) return '#facc15';
  if (s >= 4) return '#fb923c';
  return '#ef4444';
}

function severityColor(s: string): string {
  if (s === 'critical') return '#ef4444';
  if (s === 'high') return '#fb923c';
  if (s === 'medium') return '#facc15';
  return '#888';
}

function roleBadge(role: string): React.CSSProperties {
  const colors: Record<string, string> = {
    generator: '#3b82f6',
    critic: '#a78bfa',
    fix: '#f97316',
    judge: '#10b981',
    lea: '#ec4899',
    t2m_officiel: '#06b6d4',
  };
  return {
    background: colors[role] || '#555',
    color: '#000',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  };
}
