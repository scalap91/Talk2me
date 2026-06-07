/**
 * Talk2Me Admin Fuzz Dashboard #405 (Pascal 2026-06-05).
 *
 * Page admin minimaliste : voir l'état des fuzz_run + bugs ouverts dans
 * fuzz_regression. Server Component direct DB.
 *
 * Auth admin : env FUZZ_ADMIN_USER_IDS=<csv user ids> (fallback : Pascal
 * via FUZZ_ADMIN_EMAILS) — sinon 404 (pas 401 pour ne pas signaler la
 * présence de la page).
 *
 * Pas de design poussé : tableau brut. Pour itérer plus tard.
 */
import { getCurrentUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAdmin(userId: string, email: string | null | undefined): boolean {
  const ids = (process.env.FUZZ_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.includes(userId)) return true;
  const emails = (process.env.FUZZ_ADMIN_EMAILS || 'pascal.repir@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email && emails.includes(email.toLowerCase())) return true;
  return false;
}

interface FuzzRunRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  profiles_run: string;
  total_prompts: number | null;
  pass_count: number | null;
  fail_count: number | null;
  report_md_path: string | null;
  rate_limit_ms: number | null;
  side_effects: string | null;
}

interface FuzzBugRow {
  id: string;
  profile: string;
  prompt: string;
  expected_intent: string | null;
  expected_tool: string | null;
  expected_card_kind: string | null;
  first_seen_at: number;
  last_pass_at: number | null;
  last_fail_at: number | null;
  fail_count: number;
  pass_count: number;
  status: string;
  last_fail_reason: string | null;
  last_response_excerpt: string | null;
}

function fmt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function FuzzAdminPage() {
  const me = await getCurrentUser();
  if (!me) notFound();
  if (!isAdmin(me.id, me.email)) notFound();

  const db = getDb();
  // Best-effort : si tables pas encore créées (premier boot), short-circuit.
  let runs: FuzzRunRow[] = [];
  let openBugs: FuzzBugRow[] = [];
  let stats = { totalRuns: 0, totalBugs: 0, openBugCount: 0, fixedBugCount: 0 };
  try {
    runs = db.prepare('SELECT * FROM fuzz_run ORDER BY started_at DESC LIMIT 50').all() as FuzzRunRow[];
    openBugs = db.prepare(`
      SELECT * FROM fuzz_regression
      WHERE status = 'open' AND fail_count > 0
      ORDER BY fail_count DESC, last_fail_at DESC
      LIMIT 100
    `).all() as FuzzBugRow[];
    stats = {
      totalRuns: (db.prepare('SELECT COUNT(*) AS c FROM fuzz_run').get() as { c: number }).c,
      totalBugs: (db.prepare('SELECT COUNT(*) AS c FROM fuzz_regression').get() as { c: number }).c,
      openBugCount: (db.prepare("SELECT COUNT(*) AS c FROM fuzz_regression WHERE status = 'open' AND fail_count > 0").get() as { c: number }).c,
      fixedBugCount: (db.prepare("SELECT COUNT(*) AS c FROM fuzz_regression WHERE status = 'fixed'").get() as { c: number }).c,
    };
  } catch {
    // tables pas encore migrées
  }

  return (
    <div style={{ padding: 16, fontFamily: 'ui-sans-serif, system-ui', maxWidth: 1400, margin: '0 auto', color: '#e5e5e5', background: '#0a0a0a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI Fuzz Tester — Admin #405</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Doctrine [[feedback-fuzz-rapport-obligatoire]] · [[talk2me-pii-air-gap]] · CLI : <code>npm run fuzz</code>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
        <Stat label="Total runs" value={stats.totalRuns} />
        <Stat label="Total bugs détectés" value={stats.totalBugs} />
        <Stat label="Bugs ouverts" value={stats.openBugCount} highlight={stats.openBugCount > 0 ? '#ef4444' : undefined} />
        <Stat label="Bugs fixed" value={stats.fixedBugCount} highlight={stats.fixedBugCount > 0 ? '#10b981' : undefined} />
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Derniers runs</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={th}>Started</th>
              <th style={th}>Profiles</th>
              <th style={th}>Total</th>
              <th style={th}>Pass</th>
              <th style={th}>Fail</th>
              <th style={th}>Rate (ms)</th>
              <th style={th}>Side effects</th>
              <th style={th}>Rapport</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td style={td} colSpan={8}>Aucun run encore. Lance <code>npm run fuzz -- --profile=novice --count=10</code>.</td></tr>
            )}
            {runs.map((r) => {
              let profiles: string[] = [];
              try { profiles = JSON.parse(r.profiles_run); } catch {}
              let se: Record<string, unknown> = {};
              try { se = JSON.parse(r.side_effects || '{}'); } catch {}
              const passRate = r.total_prompts ? Math.round(((r.pass_count || 0) / r.total_prompts) * 100) : 0;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                  <td style={td}>{fmt(r.started_at)}</td>
                  <td style={td}>{profiles.join(',')}</td>
                  <td style={td}>{r.total_prompts ?? '—'}</td>
                  <td style={{ ...td, color: '#10b981' }}>{r.pass_count ?? '—'} ({passRate}%)</td>
                  <td style={{ ...td, color: (r.fail_count || 0) > 0 ? '#ef4444' : undefined }}>{r.fail_count ?? '—'}</td>
                  <td style={td}>{r.rate_limit_ms ?? '—'}</td>
                  <td style={{ ...td, fontSize: 11, color: '#888' }}>
                    msg={Number(se.messagesCreated) || 0} · http_err={Number(se.httpErrors) || 0} · emails={Number(se.emailsSent) || 0}
                  </td>
                  <td style={td}>{r.report_md_path ? <code style={{ fontSize: 10 }}>{r.report_md_path.split('/').slice(-1)[0]}</code> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Bugs ouverts ({openBugs.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={th}>Profile</th>
              <th style={th}>Prompt</th>
              <th style={th}>Attendu</th>
              <th style={th}>Fail count</th>
              <th style={th}>Last fail</th>
              <th style={th}>Raison</th>
            </tr>
          </thead>
          <tbody>
            {openBugs.length === 0 && (
              <tr><td style={td} colSpan={6}>Aucun bug ouvert. (ou aucun fuzz lancé)</td></tr>
            )}
            {openBugs.map((b) => (
              <tr key={b.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                <td style={td}>{b.profile}</td>
                <td style={{ ...td, maxWidth: 250 }}><code style={{ fontSize: 11 }}>{b.prompt.slice(0, 80)}</code></td>
                <td style={{ ...td, fontSize: 10 }}>
                  i={b.expected_intent || '∅'}<br />
                  t={b.expected_tool || '∅'}<br />
                  c={b.expected_card_kind || '∅'}
                </td>
                <td style={{ ...td, color: '#ef4444', fontWeight: 600 }}>×{b.fail_count}</td>
                <td style={td}>{fmt(b.last_fail_at)}</td>
                <td style={{ ...td, fontSize: 11, color: '#888', maxWidth: 350 }}>
                  {(b.last_fail_reason || '').slice(0, 250)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: '#666' }}>
        Pour lancer un run : SSH + <code>cd /home/ubuntu/talktome && npm run fuzz -- --profiles=all --count=100</code><br />
        Pour purger les users fuzz : <code>npm run fuzz:cleanup</code><br />
        Pour rejouer la régression : <code>npm run fuzz:regression</code>
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: string }) {
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: highlight || '#fff' }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 11,
  fontWeight: 600,
  color: '#aaa',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
const td: React.CSSProperties = {
  padding: '6px 8px',
  verticalAlign: 'top',
};
