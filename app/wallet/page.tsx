'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coins, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';

/**
 * Talk2Me — Wallet (Pascal 2026-06-07).
 * Solde RÉEL (ledger wallet_transactions) + historique. Crédits = recharge /
 * affiliation ; débits = boost de post. Recharge Stripe à venir ([[feedback-
 * verifier-rail-paiement]]) ; en attendant, recharge de TEST.
 */

interface Tx {
  id: string;
  amount_cents: number;
  kind: string;
  label: string | null;
  created_at: number;
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function WalletPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/wallet', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setBalance(typeof j.balance_cents === 'number' ? j.balance_cents : 0);
        setTxs(Array.isArray(j.transactions) ? j.transactions : []);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const topupTest = async () => {
    setTopping(true);
    try {
      await fetch('/api/wallet/topup-test', { method: 'POST' });
      await load();
    } finally {
      setTopping(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <Coins className="w-5 h-5 text-violet-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Wallet</h1>
        </div>

        {/* Carte solde */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#17131f] to-[#15151c] p-5 mb-3">
          <div className="text-[12px] text-white/50">Solde disponible</div>
          <div className="mt-1 text-[32px] font-bold text-white tracking-tight">
            {loading || balance === null ? '—' : euros(balance)}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-white/45">
            <ArrowDownLeft className="w-4 h-4 text-violet-300/80" />
            Sert à <span className="text-white/70">booster tes posts</span>. Bientôt rechargeable par carte.
          </div>
        </div>

        {/* Recharge test (temporaire, en attendant Stripe) */}
        <button
          type="button"
          onClick={topupTest}
          disabled={topping}
          className="w-full mb-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/12 text-white/80 text-[13px] font-medium active:scale-[0.98] transition disabled:opacity-50"
        >
          {topping ? 'Recharge…' : '+ Recharger 10 € (test)'}
        </button>

        {/* Transactions */}
        <div className="text-[12px] font-semibold text-white/45 uppercase tracking-wide mb-2">
          Transactions
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : txs.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-center">
            <p className="text-[13px] text-white/45">Aucune transaction pour l&apos;instant.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {txs.map((t) => {
              const credit = t.amount_cents >= 0;
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 ' +
                      (credit ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')
                    }
                  >
                    {credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-white/90 truncate">{t.label || t.kind}</div>
                    <div className="text-[11px] text-white/40">
                      {new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className={'text-[14px] font-semibold ' + (credit ? 'text-emerald-300' : 'text-red-300')}>
                    {credit ? '+' : ''}
                    {euros(t.amount_cents)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
