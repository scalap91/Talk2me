/**
 * Talk2Me Admin Patch Queue #406 (Pascal 2026-06-05).
 *
 * Liste les patches proposés par le Fix Agent. Pascal valide via Telegram
 * OU via les boutons approve/reject de cette page.
 *
 * Verbatim Pascal : "Auto-merge fix Agent : STRICTEMENT NON". Tout passe
 * par cette queue, RIEN n'est appliqué automatiquement.
 */

import { getCurrentUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listPatches } from '@/lib/ai-ops/patch-queue';
import PatchActions from './PatchActions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function PatchQueuePage() {
  const me = await getCurrentUser();
  if (!me || !isAiOpsAdmin(me.id, me.email)) notFound();

  const pending = listPatches('pending', 100);
  const reviewed = listPatches(undefined, 50).filter((p) => p.status !== 'pending');

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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI Ops — Patch Queue #406</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Verbatim Pascal : "Auto-merge fix Agent : STRICTEMENT NON". Toute proposition passe par cette queue.
        <br />
        Doctrine [[feedback-modular-no-scattered-patches]] · [[feedback-fuzz-rapport-obligatoire]] · {' '}
        <a href="/admin/agents" style={{ color: '#f87171' }}>Voir Agents</a>
      </p>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Patches en attente ({pending.length})</h2>
      {pending.length === 0 && (
        <p style={{ color: '#888', marginBottom: 32 }}>
          Aucun patch en attente. Le Fix Agent n'a rien proposé récemment (ou tout a été reviewé).
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {pending.map((p) => (
          <div key={p.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  <span style={typeBadge(p.patch_type)}>{p.patch_type}</span>
                  <code style={{ marginLeft: 8, color: '#facc15' }}>{p.target_file}</code>
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  Proposed by <code>{p.proposed_by_agent}</code> · {fmt(p.proposed_at)}
                </div>
              </div>
              <PatchActions patchId={p.id} />
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Source bug :</strong> {p.source_bug_pattern || '—'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Pourquoi :</strong> {p.explanation}
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Gain attendu :</strong> {p.expected_improvement || '—'}
            </div>
            <details style={{ fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: '#f87171', marginBottom: 8 }}>Voir le diff</summary>
              <pre
                style={{
                  background: '#000',
                  padding: 12,
                  borderRadius: 6,
                  overflowX: 'auto',
                  fontSize: 11,
                  color: '#d4d4d8',
                  border: '1px solid #1f1f1f',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {p.diff}
              </pre>
            </details>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Patches reviewés ({reviewed.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={th}>Reviewed</th>
              <th style={th}>Status</th>
              <th style={th}>Target</th>
              <th style={th}>Type</th>
              <th style={th}>Explanation</th>
              <th style={th}>By</th>
            </tr>
          </thead>
          <tbody>
            {reviewed.length === 0 && (
              <tr><td style={td} colSpan={6}>Aucun patch reviewé.</td></tr>
            )}
            {reviewed.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                <td style={td}>{fmt(p.reviewed_at)}</td>
                <td style={{ ...td, color: p.status === 'approved' ? '#10b981' : '#ef4444' }}>{p.status}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{p.target_file}</td>
                <td style={td}>{p.patch_type}</td>
                <td style={{ ...td, fontSize: 11, color: '#aaa' }}>{(p.explanation || '').slice(0, 100)}</td>
                <td style={td}>{p.reviewed_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #222',
  borderRadius: 8,
  padding: 16,
};
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: '#aaa', fontWeight: 500 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };

function typeBadge(type: string | null): React.CSSProperties {
  const colors: Record<string, string> = {
    prompt: '#3b82f6',
    regex: '#f87171',
    code: '#f97316',
    config: '#10b981',
  };
  return {
    background: colors[type || ''] || '#555',
    color: '#000',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  };
}
