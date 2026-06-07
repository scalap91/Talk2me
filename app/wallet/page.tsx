'use client';

import { Coins, ArrowDownLeft } from 'lucide-react';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';

/**
 * Talk2Me — Wallet (Pascal 2026-06-07).
 * Onglet portefeuille (icône deux pièces). MVP : solde RÉEL (0 tant qu'il n'y a
 * rien — pas de chiffre inventé, doctrine [[content-grounding]]). À terme : les
 * gains d'affiliation reversés à l'user (cf [[affiliation-tracking]]) + l'histo
 * des transactions s'afficheront ici.
 */
export default function WalletPage() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />

      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <Coins className="w-5 h-5 text-violet-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Wallet</h1>
        </div>

        {/* Carte solde */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#17131f] to-[#15151c] p-5 mb-4">
          <div className="text-[12px] text-white/50">Solde disponible</div>
          <div className="mt-1 text-[32px] font-bold text-white tracking-tight">0,00 €</div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-white/45">
            <ArrowDownLeft className="w-4 h-4 text-violet-300/80" />
            Tes gains d&apos;affiliation arriveront ici.
          </div>
        </div>

        {/* Transactions */}
        <div className="text-[12px] font-semibold text-white/45 uppercase tracking-wide mb-2">
          Transactions
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-center">
          <p className="text-[13px] text-white/45">
            Aucune transaction pour l&apos;instant.
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
