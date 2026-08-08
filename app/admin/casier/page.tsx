'use client';

/**
 * Talk2Me — Écran STAFF : « l'échelle qui descend » (Pascal 2026-08-08).
 * PREVIEW (dry-run) des seuils du casier + bouton APPLIQUER. Staff-only.
 * Rouge → gel + descente d'un échelon · orange → avertissement · retour au vert → rétablit.
 * Cf. lib/casier-enforce + /api/gouvernance/casier-scan. Mémoire project_talk2me_gouvernance_anticorruption.
 */
import { useCallback, useEffect, useState } from 'react';

type Action = 'freeze' | 'unfreeze' | 'warn' | 'none';
interface Outcome { user_id: string; name?: string; action: Action; reason: string; health: string; score: number }

const wrap: React.CSSProperties = { maxWidth: 660, margin: '0 auto', padding: '22px 16px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c22' };
const doctrine: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: '#5b6270', background: 'rgba(124,92,255,.08)', border: '1px solid rgba(124,92,255,.25)', borderRadius: 12, padding: '12px 14px', margin: '10px 0 16px' };
const card: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: '1px solid #E7EAF0', borderRadius: 12, marginBottom: 10, flexWrap: 'wrap' };
const btnPrimary: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, border: 'none', background: '#7C5CFF', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };

const META: Record<Action, { emoji: string; label: string; color: string; bg: string }> = {
  freeze: { emoji: '🔴', label: 'Gel + descente', color: '#B4232D', bg: 'rgba(226,76,76,.12)' },
  warn: { emoji: '🟠', label: 'Avertissement', color: '#8A5A0A', bg: 'rgba(199,122,10,.12)' },
  unfreeze: { emoji: '🟢', label: 'Rétablissement', color: '#16A34A', bg: 'rgba(22,163,74,.14)' },
  none: { emoji: '', label: '', color: '#6A7585', bg: 'transparent' },
};

export default function CasierAdminPage() {
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/gouvernance/casier-scan', { cache: 'no-store' });
    if (r.status === 403) { setForbidden(true); return; }
    const d = await r.json().catch(() => null);
    setOutcomes((d?.outcomes as Outcome[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function apply() {
    if (applying) return;
    setApplying(true); setMsg('');
    try {
      const d = await fetch('/api/gouvernance/casier-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: true }) }).then((r) => r.json());
      setMsg(d?.ok ? `✓ Appliqué à ${(d.applied || []).length} cas.` : 'Échec.');
      await load();
    } finally { setApplying(false); }
  }

  if (forbidden) return <div style={wrap}><h1 style={{ fontSize: 20 }}>⚖️ L&apos;échelle qui descend</h1><p>Réservé au <b>staff</b>.</p></div>;
  if (!outcomes) return <div style={wrap}>Chargement…</div>;

  const actionable = outcomes.filter((o) => o.action !== 'none');

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 21, margin: '0 0 2px' }}>⚖️ L&apos;échelle qui descend</h1>
      <div style={{ fontSize: 12.5, color: '#9AA0AA' }}>{actionable.length} cas détecté{actionable.length > 1 ? 's' : ''} par les seuils · aperçu (rien n&apos;est encore appliqué)</div>
      <p style={doctrine}>
        La <b>data</b> attrape les dérives. Seuils du casier : <b>🟢 vert</b> (&lt;4) rien · <b>🟠 orange</b> (4–9)
        avertissement · <b>🔴 rouge</b> (≥10) <b>gel + descente d&apos;un échelon</b> (réversible). Retour au vert →
        <b> rétablissement auto</b>. Jamais sur une sanction manuelle active. Tu vois d&apos;abord, tu appliques ensuite.
      </p>

      {actionable.length > 0 && (
        <button onClick={apply} disabled={applying} style={{ ...btnPrimary, width: '100%', marginBottom: 16, opacity: applying ? .6 : 1 }}>
          {applying ? 'Application…' : `Appliquer maintenant (${actionable.length})`}
        </button>
      )}
      {msg && <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 700, marginBottom: 12 }}>{msg}</div>}

      {actionable.length === 0 && <div style={{ color: '#9AA0AA', fontSize: 14, padding: '20px 0' }}>Aucun cas — tous les casiers sont au vert. 🟢</div>}

      {actionable.map((o) => {
        const m = META[o.action];
        return (
          <div key={o.user_id} style={card}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{o.name || o.user_id}</div>
              <div style={{ fontSize: 12, color: '#9AA0AA' }}>casier <b style={{ color: m.color }}>{o.health}</b> · score {o.score} · {o.reason}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 999, color: m.color, background: m.bg, whiteSpace: 'nowrap' }}>{m.emoji} {m.label}</span>
          </div>
        );
      })}
    </div>
  );
}
