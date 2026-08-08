'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ArrowDownLeft, ArrowUpRight, Loader2, Lock, RotateCcw, ArrowLeft, Store, Share2, Users } from '@/lib/icons';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';

/**
 * Talk2Me — MON RELEVÉ (Pascal 2026-08-05).
 * T2M est COMPTABLE, pas banquier (non-custodial, CONTRAINTE imposée) : on ENREGISTRE,
 * on ne détient jamais l'argent — il vit sur le mobile money (Orange/Airtel/MVola).
 * Donc PAS de solde / recharge / retrait custodial. Le relevé = la photo de ton argent :
 * Mes ventes (sans affiliation) + Mes commissions (affiliation) + En cours (escrow) + Journal.
 * Ledgers : wallet_transactions (+ contributor_commissions à réconcilier — étape 5). Fond BLANC.
 */

interface Tx { id: string; amount_cents: number; kind: string; label: string | null; created_at: number; currency?: string }
interface EscrowPart { user_id: string; role: string; amount_cents: number }
interface Escrow { id: string; order_ref: string | null; buyer_id: string; amount_cents: number; my_part_cents?: number; role?: string; status: string; breakdown: EscrowPart[]; created_at: number; settled_at: number | null }
interface Summary { sales_cents: number; affiliation_cents: number; other_cents: number }

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtMoney(amount: number, currency = 'MGA'): string {
  if (currency === 'MGA') return Math.round(amount).toLocaleString('fr-FR') + ' Ar';
  if (currency === 'USD') return '$' + (amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'EUR') return (amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  return (amount / 100).toLocaleString('fr-FR') + ' ' + currency;
}

const C = { page: '#F5F6F8', card: '#ffffff', line: '#EAECEF', ink: '#2F343A', mut: '#6A7585', faint: '#9DAAB7', money: '#0E9F6E', debit: '#E24A4A', warn: '#B25E00' };

export default function RelevePage() {
  const router = useRouter();
  const [currency, setCurrency] = useState('MGA');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [escrowBuyer, setEscrowBuyer] = useState<Escrow[]>([]);
  const [escrowPayee, setEscrowPayee] = useState<Escrow[]>([]);
  const [settling, setSettling] = useState<string | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletRes, escrowRes, monRes] = await Promise.all([
        fetch('/api/wallet', { cache: 'no-store' }),
        fetch('/api/wallet/escrow', { cache: 'no-store' }),
        fetch('/api/monetisation', { cache: 'no-store' }),
      ]);
      if (walletRes.ok) { const j = await walletRes.json(); if (typeof j.currency === 'string') setCurrency(j.currency); setTxs(Array.isArray(j.transactions) ? j.transactions : []); }
      if (escrowRes.ok) { const j = await escrowRes.json(); setEscrowBuyer(Array.isArray(j.asBuyer) ? j.asBuyer.filter((e: Escrow) => e.status === 'locked') : []); setEscrowPayee(Array.isArray(j.asPayee) ? j.asPayee : []); }
      if (monRes.ok) { const j = await monRes.json(); setSum({ sales_cents: j.sales_cents ?? 0, affiliation_cents: j.affiliation_cents ?? 0, other_cents: j.other_cents ?? 0 }); }
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  const settleEscrow = async (id: string, action: 'release' | 'refund') => {
    setSettling(id);
    try { await fetch(`/api/wallet/escrow/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); await load(); }
    finally { setSettling(null); }
  };

  useEffect(() => { load(); }, [load]);

  const ventes = (sum?.sales_cents ?? 0) + (sum?.other_cents ?? 0);
  const affiliation = sum?.affiliation_cents ?? 0;
  const cardStyle = { background: C.card, border: `1px solid ${C.line}` } as const;

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto overflow-hidden" style={{ background: C.page }}>
      <ChatHeader />
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => smartBack(router, '/profile')} aria-label="Retour" className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center" style={{ color: C.mut }}><ArrowLeft size={20} /></button>
          <h1 className="text-[18px] font-bold" style={{ color: C.ink }}>Mon relevé</h1>
        </div>

        <div className="rounded-2xl p-3 mb-4 text-[12.5px] leading-snug" style={{ background: '#EEF2F6', color: C.mut }}>
          ℹ️ Talk2Me tient tes comptes. L&apos;argent, lui, est sur ton <b>mobile money</b> (Orange · Airtel · MVola). Ce relevé enregistre ce qui a transité.
        </div>

        {/* MES VENTES — sans affiliation */}
        <div className="rounded-2xl p-4 mb-3" style={cardStyle}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.faint }}>💰 Mes ventes · sans affiliation</div>
          <div className="text-[26px] font-extrabold" style={{ color: C.ink }}>{loading ? '—' : fmtMoney(ventes, currency)}</div>
          <div className="text-[12px]" style={{ color: C.mut }}>Ce que tu as encaissé sur tes propres fiches.</div>
        </div>

        {/* MES COMMISSIONS — affiliation (seulement si tu en as) */}
        {affiliation > 0 && (
          <div className="rounded-2xl p-4 mb-3" style={cardStyle}>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.faint }}>🔗 Mes commissions · affiliation</div>
            <div className="text-[26px] font-extrabold" style={{ color: C.money }}>{fmtMoney(affiliation, currency)}</div>
            <div className="text-[12px]" style={{ color: C.mut }}>Référent + parrainage sur les ventes des autres. Détail dans <b>Mon parcours</b>.</div>
          </div>
        )}

        {/* MES SOURCES — comment je gagne (fusion depuis /monetisation, SANS le « solde · retrait » custodial). */}
        <div className="text-[11px] font-bold uppercase tracking-wide mb-2 mt-1" style={{ color: C.faint }}>💡 Mes sources de revenus</div>
        <div className="rounded-2xl overflow-hidden mb-4" style={cardStyle}>
          {([
            { Icon: Store, label: 'Boutique', desc: 'Vends tes produits, tu encaisses la vente.', href: '/ma-boutique' },
            { Icon: Share2, label: 'Affiliation', desc: 'Partage des produits, touche une commission.', href: '/shop' },
            { Icon: Users, label: 'Parrainage', desc: 'Fais entrer des commerces, gagne sur leurs ventes.', href: '/parcours' },
          ] as const).map((s, i) => (
            <button key={s.label} onClick={() => router.push(s.href)} className="w-full flex items-center gap-3 py-3 px-3 text-left" style={{ borderTop: i ? `1px solid ${C.line}` : 'none', background: 'transparent' }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#EEF2F6', color: C.mut }}><s.Icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold" style={{ color: C.ink }}>{s.label}</span>
                <span className="block text-[12px]" style={{ color: C.mut }}>{s.desc}</span>
              </span>
              <span style={{ color: C.faint }}>›</span>
            </button>
          ))}
        </div>

        {/* EN COURS — escrow */}
        {(escrowBuyer.length > 0 || escrowPayee.length > 0) && (
          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: C.faint }}><Lock className="w-3.5 h-3.5" /> En cours · achats protégés</div>
            {escrowBuyer.map((e) => (
              <div key={e.id} className="rounded-2xl p-3 mb-2" style={{ background: '#FFF7EC', border: '1px solid #F3D9AE' }}>
                <div className="flex items-center justify-between">
                  <div className="text-[13px]" style={{ color: C.ink }}>Tu as payé <b>{euros(e.amount_cents)}</b></div>
                  <span className="text-[11px]" style={{ color: C.warn }}>bloqué 🔒</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.mut }}>Bloqué jusqu&apos;à ce que tu confirmes la livraison.</div>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => settleEscrow(e.id, 'release')} disabled={settling === e.id} className="flex-1 py-2 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: C.money }}>{settling === e.id ? '…' : "✓ J'ai reçu — libérer"}</button>
                  <button onClick={() => settleEscrow(e.id, 'refund')} disabled={settling === e.id} className="px-3 py-2 rounded-xl text-[13px] inline-flex items-center gap-1 disabled:opacity-50" style={{ background: '#fff', border: `1px solid ${C.line}`, color: C.mut }}><RotateCcw className="w-3.5 h-3.5" /> Annuler</button>
                </div>
              </div>
            ))}
            {escrowPayee.map((e) => (
              <div key={e.id} className="rounded-2xl p-3 mb-2" style={cardStyle}>
                <div className="flex items-center justify-between">
                  <div className="text-[13px]" style={{ color: C.ink }}>À recevoir : <b>{euros(e.my_part_cents ?? 0)}</b> <span style={{ color: C.faint }}>({e.role})</span></div>
                  <span className="text-[11px]" style={{ color: C.faint }}>en attente ⏳</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.mut }}>Payé dès que l&apos;acheteur confirme la livraison.</div>
              </div>
            ))}
          </div>
        )}

        {/* JOURNAL */}
        <div className="text-[11px] font-bold uppercase tracking-wide mb-2 mt-4" style={{ color: C.faint }}>📒 Journal des transactions</div>
        {loading ? (
          <div className="flex items-center justify-center py-8" style={{ color: C.faint }}><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : txs.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={cardStyle}><p className="text-[13px]" style={{ color: C.mut }}>Aucune transaction pour l&apos;instant.</p></div>
        ) : (
          <ul className="rounded-2xl overflow-hidden" style={cardStyle}>
            {txs.map((t, i) => {
              const credit = t.amount_cents >= 0;
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5 px-3" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: credit ? 'rgba(14,159,110,.12)' : 'rgba(226,74,74,.12)', color: credit ? C.money : C.debit }}>{credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate" style={{ color: C.ink }}>{t.label || t.kind}</div>
                    <div className="text-[11px]" style={{ color: C.faint }}>{new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="text-[14px] font-bold" style={{ color: credit ? C.money : C.debit }}>{credit ? '+' : ''}{fmtMoney(t.amount_cents, t.currency)}</div>
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
