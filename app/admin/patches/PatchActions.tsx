'use client';

import { useState } from 'react';

export default function PatchActions({ patchId }: { patchId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function act(decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ai-ops/patch/${encodeURIComponent(patchId)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        setDone(decision === 'approve' ? 'approved' : 'rejected');
      } else {
        const b = await r.json().catch(() => ({}));
        alert(`Erreur : ${b?.error || r.status}`);
        setBusy(false);
      }
    } catch (e) {
      alert(`Erreur réseau : ${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ color: done === 'approved' ? '#10b981' : '#ef4444', fontSize: 13, fontWeight: 600 }}>
        {done.toUpperCase()}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => act('approve')}
        disabled={busy}
        style={btn('#10b981')}
      >
        {busy ? '…' : 'Approve'}
      </button>
      <button
        onClick={() => act('reject')}
        disabled={busy}
        style={btn('#ef4444')}
      >
        {busy ? '…' : 'Reject'}
      </button>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#000',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
