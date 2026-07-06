'use client';

/**
 * Talk2Me #408b — Boutons Approve/Reject pour un patch dans /schema/ai-ops.
 *
 * Variante stylée tailwind du composant /admin/patches/PatchActions.tsx.
 * Réutilise EXACTEMENT les mêmes routes API (/api/admin/ai-ops/patch/[id]/{approve|reject}).
 */

import { useState } from 'react';

export default function PatchActionsInline({ patchId }: { patchId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: 'approve' | 'reject') {
    if (busy || done) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/admin/ai-ops/patch/${encodeURIComponent(patchId)}/${decision}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(b?.error || `HTTP ${r.status}`);
        setBusy(false);
        return;
      }
      setDone(decision === 'approve' ? 'approved' : 'rejected');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span
        className={
          'text-[11px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-md ' +
          (done === 'approved'
            ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'
            : 'bg-red-500/15 text-red-200 border border-red-400/30')
        }
      >
        {done}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => act('approve')}
        disabled={busy}
        className="text-[11px] font-medium px-2.5 h-7 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
      >
        {busy ? '…' : 'Approve'}
      </button>
      <button
        type="button"
        onClick={() => act('reject')}
        disabled={busy}
        className="text-[11px] font-medium px-2.5 h-7 rounded-md bg-red-500/15 border border-red-400/30 text-red-100 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
      >
        {busy ? '…' : 'Reject'}
      </button>
      {err && (
        <span className="text-[10.5px] text-red-300/85 ml-1" title={err}>
          ⚠
        </span>
      )}
    </div>
  );
}
