'use client';

/**
 * Talk2Me — Watcher MOBILE des demandes de paiement desktop (Pascal 2026-06-26).
 * Monté globalement : il interroge /api/pay-auth/pending. Si une validation est en
 * attente ET que la session courante PEUT valider (mobile natif, pas un PC) → popup
 * « Autoriser le paiement ? ». L'user approuve → le desktop entre sur la page de
 * paiement. Un PC ne voit JAMAIS ce popup (can_approve=false côté serveur).
 */
import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Loader2 } from '@/lib/icons';
import { formatMoney } from '@/lib/money';

interface Pending { id: string; amount_cents: number; currency: string; label: string | null; created_at: number }

export default function PayAuthWatcher() {
  const [item, setItem] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const d = await fetch('/api/pay-auth/pending', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      if (d?.ok && d.can_approve && Array.isArray(d.pending) && d.pending.length) setItem(d.pending[0]);
      else setItem((cur) => (cur ? null : cur));
    } catch { /* */ }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  const act = async (action: 'approve' | 'deny') => {
    if (!item || busy) return;
    setBusy(action);
    try {
      await fetch('/api/pay-auth/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, action: action === 'deny' ? 'deny' : 'approve' }) });
      setItem(null);
    } finally { setBusy(null); }
  };

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101015] p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center mx-auto mb-3"><ShieldCheck className="w-7 h-7 text-emerald-300" /></div>
        <h2 className="text-white font-semibold text-[17px]">Autoriser ce paiement ?</h2>
        <p className="text-white/55 text-[13px] mt-2 leading-relaxed">
          Un paiement a été lancé depuis un <b className="text-white/80">ordinateur</b> connecté à ton compte.
        </p>
        <div className="mt-3 rounded-2xl bg-white/[0.05] border border-white/10 p-3">
          <div className="text-white/60 text-[12px]">{item.label || 'Paiement'}</div>
          <div className="text-white font-bold text-[20px] mt-0.5">{formatMoney(item.amount_cents)}</div>
        </div>
        <p className="text-amber-200/80 text-[11.5px] mt-3">Si ce n’est pas toi, refuse.</p>
        <div className="flex gap-2.5 mt-4">
          <button onClick={() => act('deny')} disabled={!!busy} className="flex-1 h-12 rounded-full bg-white/10 text-white/80 text-[14px] font-semibold disabled:opacity-50">
            {busy === 'deny' ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Refuser'}
          </button>
          <button onClick={() => act('approve')} disabled={!!busy} className="flex-1 h-12 rounded-full bg-emerald-500 text-black text-[14px] font-semibold disabled:opacity-50">
            {busy === 'approve' ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Autoriser'}
          </button>
        </div>
      </div>
    </div>
  );
}
