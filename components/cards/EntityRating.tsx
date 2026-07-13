'use client';

/**
 * Talk2Me — NOTE LECTEUR + SIGNALEMENT d'une page-entité (M3, Pascal 2026-07-08).
 * Le public juge la FIABILITÉ (👍/👎) et peut signaler. Un article mal noté / signalé
 * remonte en révision. Thème clair (tokens --t2m-*). Vote/signalement = connecté.
 */
import { useEffect, useState } from 'react';
import GetAppSheet from '@/components/public/GetAppSheet';

interface Summary {
  fiable: number;
  douteux: number;
  total: number;
  score: number;
  myVote: 0 | 1 | -1;
  reports: number;
  flagged: boolean;
}

const REPORT_REASONS: [string, string][] = [
  ['faux', 'Faux'],
  ['trompeur', 'Trompeur'],
  ['spam', 'Spam'],
  ['offensant', 'Offensant'],
];

export default function EntityRating({ cardId }: { cardId: string }) {
  const [s, setS] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [getApp, setGetApp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/cards/${cardId}/rate`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && setS(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cardId]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  async function vote(v: 1 | -1) {
    if (busy || !s) return;
    setBusy(true);
    const value = s.myVote === v ? 0 : v; // re-cliquer = retirer
    try {
      const r = await fetch(`/api/cards/${cardId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (r.status === 401) {
        setGetApp(true);
        return;
      }
      if (r.ok) setS(await r.json());
    } catch {
      /* silencieux */
    } finally {
      setBusy(false);
    }
  }

  async function report(reason: string) {
    try {
      const r = await fetch(`/api/cards/${cardId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (r.status === 401) {
        setReportOpen(false);
        setGetApp(true);
        return;
      }
      if (r.ok) {
        setReportOpen(false);
        flash('Merci — signalement transmis.');
        const j = await r.json();
        if (j?.flagged) setS((prev) => (prev ? { ...prev, flagged: true } : prev));
      }
    } catch {
      /* silencieux */
    }
  }

  if (!s) return null;

  const btn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 13px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--t2m-primary)' : 'var(--t2m-line)'}`,
    background: active ? 'color-mix(in srgb, var(--t2m-primary) 12%, transparent)' : 'var(--t2m-paper)',
    color: active ? 'var(--t2m-primary-deep, var(--t2m-primary))' : 'var(--t2m-ink)',
    fontWeight: 700,
    fontSize: 13.5,
    cursor: busy ? 'default' : 'pointer',
  });

  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '4px 18px 8px' }}>
      {s.flagged && (
        <div
          style={{
            fontSize: 12.5, fontWeight: 700, color: '#92400E',
            background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10,
            padding: '8px 12px', marginBottom: 10,
          }}
        >
          ⚠️ Cet article a été signalé et est en cours de révision.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, color: 'var(--t2m-ink-2)', fontWeight: 600 }}>Cet article vous semble fiable ?</span>
        <button type="button" onClick={() => vote(1)} disabled={busy} style={btn(s.myVote === 1)} aria-pressed={s.myVote === 1}>
          👍 Fiable{s.fiable ? ` · ${s.fiable}` : ''}
        </button>
        <button type="button" onClick={() => vote(-1)} disabled={busy} style={btn(s.myVote === -1)} aria-pressed={s.myVote === -1}>
          👎 Douteux{s.douteux ? ` · ${s.douteux}` : ''}
        </button>
        <button
          type="button"
          onClick={() => setReportOpen((v) => !v)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t2m-ink-3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          ⚑ Signaler
        </button>
      </div>

      {s.total > 0 && (
        <p style={{ fontSize: 12, color: 'var(--t2m-ink-3)', margin: '6px 0 0' }}>
          {s.score}% des lecteurs jugent cet article fiable ({s.total} avis).
        </p>
      )}

      {reportOpen && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', alignSelf: 'center' }}>Motif :</span>
          {REPORT_REASONS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => report(k)}
              style={{
                padding: '6px 12px', borderRadius: 999, border: '1px solid var(--t2m-line)',
                background: 'var(--t2m-wash)', color: 'var(--t2m-ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
            background: 'var(--t2m-ink)', color: '#fff', padding: '11px 18px', borderRadius: 12,
            fontSize: 14, fontWeight: 600, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}

      <GetAppSheet open={getApp} onClose={() => setGetApp(false)} context="join" />
    </section>
  );
}
