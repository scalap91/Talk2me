/**
 * Talk2Me #409 — Feature detail page (Pascal 2026-06-05).
 *
 * Affiche l'historique des 30 derniers runs pour une feature + permet
 * d'identifier les régressions ponctuelles vs cassures durables.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getFeature, featureHistory } from '@/lib/feature-registry/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function statusColor(s: string): string {
  if (s === 'live') return '#22c55e';
  if (s === 'broken') return '#ef4444';
  if (s === 'flaky') return '#f59e0b';
  if (s === 'pending_test') return '#64748b';
  return '#94a3b8';
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FeatureDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await getCurrentUser();
  const overrideEnv = process.env.FEATURE_REGISTRY_ADMIN_EMAILS;
  let isAdmin = false;
  if (overrideEnv) {
    const emails = overrideEnv.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (me?.email && emails.includes(me.email.toLowerCase())) isAdmin = true;
  }
  if (!isAdmin) isAdmin = !!(me && isAiOpsAdmin(me.id, me.email));
  if (!isAdmin) notFound();

  const feature = getFeature(id);
  if (!feature) notFound();

  const history = featureHistory(id, 30);
  const sparkline = history.slice().reverse().map((h) => (h.passed ? '█' : '·')).join('');

  return (
    <main className="min-h-[100dvh] w-full bg-[#0a0a0a] text-white p-4">
      <div style={{ maxWidth: 1000, margin: '0 auto', fontFamily: 'ui-sans-serif, system-ui' }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/schema/features" style={{ color: '#f87171', fontSize: 13 }}>← Feature Registry</Link>
        </div>

        <h1 style={{ fontSize: 22, marginBottom: 4 }}>{feature.feature_name}</h1>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>
          <code style={{ background: '#111827', padding: '2px 6px', borderRadius: 4 }}>{feature.id}</code>{' '}
          · module : <strong>{feature.module}</strong>
          {feature.added_in_task ? ` · task ${feature.added_in_task}` : ''}
        </div>

        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: statusColor(feature.status) }}>{feature.status}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Consecutive fails</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: feature.consecutive_fails > 0 ? '#ef4444' : '#22c55e' }}>{feature.consecutive_fails}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Last pass</div>
              <div style={{ fontSize: 14, color: '#22c55e' }}>{fmt(feature.last_pass_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Last fail</div>
              <div style={{ fontSize: 14, color: feature.last_fail_at ? '#ef4444' : '#475569' }}>{fmt(feature.last_fail_at)}</div>
            </div>
          </div>
        </section>

        {feature.description ? (
          <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 14 }}>{feature.description}</div>
          </section>
        ) : null}

        {feature.last_fail_reason ? (
          <section style={{ background: '#1f1010', border: '1px solid #ef444460', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#fca5a5', textTransform: 'uppercase', marginBottom: 6 }}>Last fail reason</div>
            <pre style={{ fontSize: 12, color: '#fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{feature.last_fail_reason}</pre>
          </section>
        ) : null}

        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Sparkline (30 derniers runs, gauche=ancien)</div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, letterSpacing: 2, color: '#22c55e' }}>{sparkline || '(aucun historique)'}</div>
        </section>

        <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 16, marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Historique ({history.length} runs)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #1f2937' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Run ID</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Passed</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Dur.</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #1f293730' }}>
                  <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>{h.run_id.slice(0, 8)}</td>
                  <td style={{ padding: '4px 8px', color: h.passed ? '#22c55e' : '#ef4444' }}>{h.passed ? 'OK' : 'KO'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#94a3b8' }}>{h.duration_ms ?? '—'}ms</td>
                  <td style={{ padding: '4px 8px', color: '#fca5a5' }}>{(h.error_message || '').slice(0, 200)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
