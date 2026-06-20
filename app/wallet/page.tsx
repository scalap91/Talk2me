'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, ArrowDownLeft, ArrowUpRight, Loader2, Store, Copy, Check, Lock, RotateCcw, ArrowLeft } from 'lucide-react';
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

interface Boutique {
  id: string;
  name: string;
  slug: string | null;
}

interface EscrowPart { user_id: string; role: string; amount_cents: number }
interface Escrow {
  id: string; order_ref: string | null; buyer_id: string; amount_cents: number;
  status: string; breakdown: EscrowPart[]; created_at: number; settled_at: number | null;
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState(false);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [escrowBuyer, setEscrowBuyer] = useState<Escrow[]>([]);
  const [escrowPayee, setEscrowPayee] = useState<Escrow[]>([]);
  const [lockedCents, setLockedCents] = useState(0);
  const [settling, setSettling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletRes, boutiquesRes, escrowRes] = await Promise.all([
        fetch('/api/wallet', { cache: 'no-store' }),
        fetch('/api/boutiques', { cache: 'no-store' }),
        fetch('/api/wallet/escrow', { cache: 'no-store' }),
      ]);

      if (walletRes.ok) {
        const j = await walletRes.json();
        setBalance(typeof j.balance_cents === 'number' ? j.balance_cents : 0);
        setTxs(Array.isArray(j.transactions) ? j.transactions : []);
      }

      if (boutiquesRes.ok) {
        const j = await boutiquesRes.json();
        setBoutiques(Array.isArray(j.boutiques) ? j.boutiques : []);
      }

      if (escrowRes.ok) {
        const j = await escrowRes.json();
        setEscrowBuyer(Array.isArray(j.asBuyer) ? j.asBuyer.filter((e: Escrow) => e.status === 'locked') : []);
        setEscrowPayee(Array.isArray(j.asPayee) ? j.asPayee : []);
        setLockedCents(typeof j.locked_cents === 'number' ? j.locked_cents : 0);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  const settleEscrow = async (id: string, action: 'release' | 'refund') => {
    setSettling(id);
    try {
      await fetch(`/api/wallet/escrow/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      await load();
    } finally { setSettling(null); }
  };

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

  // Recharge RÉELLE via le rail paiement (sandbox pour l'instant → MVola ensuite).
  const topupReal = async () => {
    const s = window.prompt('Montant à recharger (€) :', '5');
    if (!s) return;
    const eur = parseFloat(s.replace(',', '.'));
    if (!eur || eur <= 0) return;
    setTopping(true);
    try {
      const r = await fetch('/api/wallet/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: Math.round(eur * 100) }),
      });
      const d = await r.json();
      if (d.ok && d.checkout_url) { window.location.assign(d.checkout_url); return; }
      alert('Recharge indisponible pour le moment.');
    } finally {
      setTopping(false);
    }
  };

  // RETRAIT vendeur (cash-out) vers mobile money.
  const withdraw = async () => {
    const s = window.prompt('Montant à retirer (€) :', '5');
    if (!s) return;
    const eur = parseFloat(s.replace(',', '.'));
    if (!eur || eur <= 0) return;
    const msisdn = window.prompt('Numéro mobile money (ex : 034 12 345 67) :', '') || '';
    setTopping(true);
    try {
      const r = await fetch('/api/wallet/payout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: Math.round(eur * 100), msisdn }),
      });
      const d = await r.json();
      if (d.ok) { await load(); alert('Retrait envoyé.'); }
      else if (d.error === 'insufficient_balance') alert('Solde insuffisant.');
      else alert('Retrait indisponible pour le moment.');
    } finally {
      setTopping(false);
    }
  };

  const copyUrl = async (boutique: Boutique, e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://talk2me.fr';
    const url = boutique.slug ? `${origin}/${boutique.slug}` : `${origin}/boutique/${boutique.id}`;
    
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(boutique.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const openBoutique = (boutique: Boutique) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://talk2me.fr';
    const url = boutique.slug ? `${origin}/${boutique.slug}` : `${origin}/boutique/${boutique.id}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => router.back()}
            aria-label="Retour"
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-white/80 hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <Coins className="w-5 h-5 text-red-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Wallet</h1>
        </div>

        {/* Carte solde */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#17131f] to-[#15151c] p-5 mb-3">
          <div className="text-[12px] text-white/50">Solde disponible</div>
          <div className="mt-1 text-[32px] font-bold text-white tracking-tight">
            {loading || balance === null ? '—' : euros(balance)}
          </div>
          {lockedCents > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-300/90">
              <Lock className="w-3.5 h-3.5" />
              dont {euros(lockedCents)} bloqués (en attente de livraison)
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-[12px] text-white/45">
            <ArrowDownLeft className="w-4 h-4 text-red-300/80" />
            Sert à <span className="text-white/70">booster tes posts</span>. Bientôt rechargeable par carte.
          </div>
        </div>

        {/* Recharger / Retirer (rail paiement — sandbox pour l'instant, MVola à venir) */}
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={topupReal}
            disabled={topping}
            className="flex-1 py-3 rounded-xl bg-white text-black text-[14px] font-bold active:scale-[0.98] transition disabled:opacity-50"
          >
            {topping ? '…' : 'Recharger'}
          </button>
          <button
            type="button"
            onClick={withdraw}
            disabled={topping}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white text-[14px] font-bold active:scale-[0.98] transition disabled:opacity-50"
          >
            Retirer
          </button>
        </div>
        {/* Recharge test (temporaire, à retirer quand MVola est LIVE) */}
        <button
          type="button"
          onClick={topupTest}
          disabled={topping}
          className="w-full mb-5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white/55 text-[12px] font-medium active:scale-[0.98] transition disabled:opacity-50"
        >
          {topping ? '…' : '+ 10 € (test)'}
        </button>

        {/* ESCROW — transactions verrouillées (le cœur de l'économie d'échange) */}
        {(escrowBuyer.length > 0 || escrowPayee.length > 0) && (
          <div className="mb-5">
            <div className="text-[12px] font-semibold text-white/45 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Paiements verrouillés (escrow)
            </div>

            {/* En tant qu'acheteur : je confirme la livraison (libère) ou j'annule (rembourse) */}
            {escrowBuyer.map((e) => (
              <div key={e.id} className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-3 mb-2">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] text-white/90">Tu as payé <b>{euros(e.amount_cents)}</b></div>
                  <span className="text-[11px] text-amber-300">bloqué 🔒</span>
                </div>
                <div className="text-[11px] text-white/45 mt-0.5">L&apos;argent est tenu jusqu&apos;à ce que tu confirmes la livraison.</div>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => settleEscrow(e.id, 'release')} disabled={settling === e.id}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold disabled:opacity-50 active:scale-[0.98]">
                    {settling === e.id ? '…' : '✓ J&apos;ai reçu — libérer'}
                  </button>
                  <button onClick={() => settleEscrow(e.id, 'refund')} disabled={settling === e.id}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white/70 text-[13px] inline-flex items-center gap-1 disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Annuler
                  </button>
                </div>
              </div>
            ))}

            {/* En tant que bénéficiaire : en attente que l'acheteur confirme */}
            {escrowPayee.map((e) => (
              <div key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 mb-2">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] text-white/90">À recevoir : <b>{euros(e.my_part_cents)}</b> <span className="text-white/45">({e.role})</span></div>
                  <span className="text-[11px] text-white/45">en attente ⏳</span>
                </div>
                <div className="text-[11px] text-white/45 mt-0.5">Tu seras payé dès que l&apos;acheteur confirme la livraison.</div>
              </div>
            ))}
          </div>
        )}

        {/* Monétisation — Mes boutiques */}
        <div className="text-[12px] font-semibold text-white/45 uppercase tracking-wide mb-2">
          Monétisation — Mes boutiques
        </div>
        {boutiques.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-center mb-5">
            <p className="text-[13px] text-white/45">Crée ta boutique depuis le Shop (+) pour avoir ton lien.</p>
          </div>
        ) : (
          <div className="mb-5">
            {boutiques.map((b) => {
              const origin = typeof window !== 'undefined' ? window.location.origin : 'https://talk2me.fr';
              const url = b.slug ? `${origin}/${b.slug}` : `${origin}/boutique/${b.id}`;
              const displayUrl = url.replace(/^https?:\/\//, '');
              
              return (
                <div
                  key={b.id}
                  onClick={() => openBoutique(b)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 mb-2 flex items-center gap-3 cursor-pointer hover:bg-white/[0.06] transition"
                >
                  <Store className="w-5 h-5 text-red-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-white truncate">{b.name}</div>
                    <div className="text-[12px] text-red-300 truncate">{displayUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => copyUrl(b, e)}
                    className="px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-100 text-[12px] hover:bg-red-500/30 transition shrink-0"
                  >
                    {copiedId === b.id ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Copié ✓
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="w-3 h-3" />
                        Copier
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
