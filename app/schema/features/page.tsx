/**
 * Talk2Me #409 — Dashboard Feature Registry (Pascal 2026-06-05).
 *
 * Verbatim Pascal : "noter dans un fichier toutes les nouvelles fonctionnalités
 * et upgrades, ou mieux un module qui tourne pour essayer précisément chaque
 * fonctionnalité et répertorie chaque fonction associée."
 *
 * Doctrine [[airbizness-schema-technique]] : la Boussole reflète le code.
 * Doctrine [[feedback-watchdog-pipeline]] : régression visible immédiatement.
 *
 * Server Component, accès admin via FEATURE_REGISTRY_ADMIN_EMAILS (fallback
 * AI_OPS_ADMIN_EMAILS).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import {
  globalHealth,
  moduleHealth,
  listFeatures,
  lastRuns,
} from '@/lib/feature-registry/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function bar(pct: number): string {
  const blocks = Math.round(pct / 12.5); // 0..8
  return '█'.repeat(blocks) + '░'.repeat(8 - blocks);
}

function statusColor(s: string): string {
  if (s === 'live') return '#22c55e';
  if (s === 'broken') return '#ef4444';
  if (s === 'flaky') return '#f59e0b';
  if (s === 'pending_test') return '#64748b';
  if (s === 'deprecated') return '#475569';
  return '#94a3b8';
}

export default async function FeaturesDashboardPage() {
  // Admin gate : FEATURE_REGISTRY_ADMIN_EMAILS fallback AI_OPS_ADMIN_EMAILS
  // Doctrine [[talktome-master-prompt]] : pas de fuite registry au public.
  const me = await getCurrentUser();
  const overrideEnv = process.env.FEATURE_REGISTRY_ADMIN_EMAILS;
  let isAdmin = false;
  if (overrideEnv) {
    const emails = overrideEnv.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (me?.email && emails.includes(me.email.toLowerCase())) isAdmin = true;
  }
  if (!isAdmin) isAdmin = !!(me && isAiOpsAdmin(me.id, me.email));
  if (!isAdmin) notFound();

  const health = globalHealth();
  const mods = moduleHealth();
  const recentRuns = lastRuns(10);
  const allFeatures = listFeatures();
  const brokenFeatures = allFeatures.filter((f) => f.status === 'broken' || f.status === 'flaky');

  const pctGlobal = Math.round((health.pass_rate || 0) * 100);

  return (
    <main className="min-h-[100dvh] w-full bg-[#0a0a0a] text-white p-4">
      <div style={{ maxWidth: 1280, margin: '0 auto', fontFamily: 'ui-sans-serif, system-ui' }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/schema" style={{ color: '#a78bfa', fontSize: 13 }}>← Boussole</Link>
        </div>

        <h1 style={{ fontSize: 22, marginBottom: 4 }}>
          Feature Registry — Régression watchdog #409
        </h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
          Verbatim Pascal : « je n'accepte pas la régression : quand j'ajoute une fonctionnalité, y en a qui fonctionne plus au bout de plusieurs modifications »
        </p>

        {/* Header global */}
        <section
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Health globale</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: pctGlobal >= 90 ? '#22c55e' : pctGlobal >= 75 ? '#f59e0b' : '#ef4444' }}>
              {pctGlobal}%
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {health.live}/{health.total - health.deprecated} features live
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Live</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{health.live}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Broken</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{health.broken}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Flaky</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{health.flaky}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Pending test</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}>{health.pending}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{health.total}</div>
          </div>
        </section>

        {/* Santé par module */}
        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Santé par module</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #1f2937' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Module</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Live</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Broken</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Flaky</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Pending</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Santé</th>
              </tr>
            </thead>
            <tbody>
              {mods.map((m) => {
                const denom = m.total - m.deprecated;
                const pct = denom ? Math.round((m.live / denom) * 100) : 100;
                const flag = m.broken > 0 ? '🚨' : m.flaky > 0 ? '⚠️' : '';
                return (
                  <tr key={m.module} style={{ borderBottom: '1px solid #1f293730' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <Link href={`/schema/features?module=${m.module}`} style={{ color: '#e5e5e5' }}>
                        {m.module}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#22c55e' }}>{m.live}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: m.broken ? '#ef4444' : '#475569' }}>{m.broken}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: m.flaky ? '#f59e0b' : '#475569' }}>{m.flaky}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b' }}>{m.pending}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{denom}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, monospace', color: pct >= 90 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444' }}>
                      {bar(pct)} {pct}% {flag}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Features broken/flaky en priorité */}
        {brokenFeatures.length > 0 && (
          <section style={{ background: '#111827', border: '1px solid #ef444440', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12, color: '#ef4444' }}>
              Features cassées / flaky ({brokenFeatures.length})
            </h2>
            <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 16 }}>
              {brokenFeatures.map((f) => (
                <li key={f.id}>
                  <span style={{ color: statusColor(f.status), fontWeight: 600 }}>[{f.status}]</span>{' '}
                  <Link href={`/schema/features/${encodeURIComponent(f.id)}`} style={{ color: '#a78bfa' }}>{f.id}</Link>{' '}
                  <span style={{ color: '#94a3b8' }}>({f.module})</span>{' '}
                  — {f.feature_name}
                  {f.last_fail_reason ? (
                    <div style={{ color: '#fca5a5', fontSize: 12, paddingLeft: 16 }}>
                      {f.last_fail_reason.slice(0, 200)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Toutes les features */}
        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Toutes les features ({allFeatures.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #1f2937' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Module</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Nom</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Last pass</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Last fail</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Task</th>
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #1f293730' }}>
                  <td style={{ padding: '4px 6px', color: '#94a3b8' }}>{f.module}</td>
                  <td style={{ padding: '4px 6px' }}>
                    <Link href={`/schema/features/${encodeURIComponent(f.id)}`} style={{ color: '#a78bfa' }}>{f.id}</Link>
                  </td>
                  <td style={{ padding: '4px 6px' }}>{f.feature_name}</td>
                  <td style={{ padding: '4px 6px', color: statusColor(f.status) }}>{f.status}</td>
                  <td style={{ padding: '4px 6px', color: '#94a3b8' }}>{fmt(f.last_pass_at)}</td>
                  <td style={{ padding: '4px 6px', color: f.last_fail_at ? '#fca5a5' : '#475569' }}>{fmt(f.last_fail_at)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#94a3b8' }}>{f.added_in_task || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Runs récents */}
        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>10 runs récents</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #1f2937' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Run</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Quand</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Trigger</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Total</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Passed</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Failed</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Dur.</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #1f293730' }}>
                  <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace' }}>{r.id.slice(0, 8)}</td>
                  <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{fmt(r.run_at)}</td>
                  <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{r.trigger || '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.total ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#22c55e' }}>{r.passed ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: r.failed ? '#ef4444' : '#475569' }}>{r.failed ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#94a3b8' }}>{r.duration_ms ? `${r.duration_ms}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 32 }}>
          CLI : <code style={{ background: '#0a0a0a', padding: '2px 6px', borderRadius: 4 }}>npm run features:check</code> · <code style={{ background: '#0a0a0a', padding: '2px 6px', borderRadius: 4 }}>npm run features:list</code> · <code style={{ background: '#0a0a0a', padding: '2px 6px', borderRadius: 4 }}>npm run features:drift</code>
        </div>
      </div>
    </main>
  );
}
