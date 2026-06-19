'use client';

/**
 * Talk2Me — Monétisation (Pascal 2026-06-19).
 * Hub « comment je gagne » : total des gains RÉELS (ledger) + sources (boutique,
 * affiliation, parrainage) avec leur montant réel (0 si rien), et CTA pour activer.
 * Distinct du Wallet (où l'argent atterrit + retrait). Aucun chiffre inventé.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Store, Share2, Users, Wallet as WalletIcon, Loader2 } from 'lucide-react';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';

interface Summary {
  total_cents: number;
  sales_cents: number;
  affiliation_cents: number;
  other_cents: number;
  balance_cents: number;
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MonetisationPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/monetisation', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setS(j))
      .finally(() => setLoading(false));
  }, []);

  const sources = [
    {
      key: 'boutique', icon: Store, label: 'Boutique',
      desc: 'Vends tes produits, tu encaisses la vente.',
      amount: s?.sales_cents ?? 0, href: '/ma-boutique', cta: 'Ma boutique', live: true,
    },
    {
      key: 'affiliation', icon: Share2, label: 'Affiliation',
      desc: 'Partage des produits : tu touches une commission sur chaque achat.',
      amount: s?.affiliation_cents ?? 0, href: '/shop', cta: 'Découvrir', live: true,
    },
    {
      key: 'parrainage', icon: Users, label: 'Parrainage',
      desc: 'Invite des amis sur Talk2Me et gagne un bonus. (Bientôt)',
      amount: 0, href: null, cta: '', live: false,
    },
  ];

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Monétisation</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/50">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Total gagné */}
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 mb-4">
              <div className="text-[11px] uppercase tracking-wider text-emerald-200/70">Total gagné</div>
              <div className="text-[34px] font-semibold text-white mt-1 leading-none">
                {euros(s?.total_cents ?? 0)}
              </div>
              <div className="text-[12px] text-white/45 mt-2">
                Cumul de tes gains sur Talk2Me, toutes sources confondues.
              </div>
            </div>

            {/* Sources de gains */}
            <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2 mt-5">Tes sources de revenus</div>
            <div className="space-y-3">
              {sources.map((src) => {
                const Icon = src.icon;
                const inner = (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-white/12 flex items-center justify-center text-white/80 shrink-0">
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] text-white/95 font-medium">{src.label}</div>
                        <div className="text-[12px] text-white/55 leading-snug">{src.desc}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <div className="text-[15px] font-semibold text-white/95">{euros(src.amount)}</div>
                      {src.live && src.cta ? (
                        <div className="text-[12px] text-emerald-300 mt-0.5">{src.cta} ›</div>
                      ) : (
                        <div className="text-[11px] text-white/35 mt-0.5">Bientôt</div>
                      )}
                    </div>
                  </div>
                );
                return src.href ? (
                  <Link key={src.key} href={src.href}>{inner}</Link>
                ) : (
                  <div key={src.key} className="opacity-70">{inner}</div>
                );
              })}
            </div>

            {/* Vers le portefeuille */}
            <Link
              href="/wallet"
              className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-400/25 flex items-center justify-center text-red-300">
                  <WalletIcon size={17} />
                </div>
                <div>
                  <div className="text-[14px] text-white/95 font-medium">Mon portefeuille</div>
                  <div className="text-[12px] text-white/55">Solde {euros(s?.balance_cents ?? 0)} · retrait</div>
                </div>
              </div>
              <span className="text-white/45">›</span>
            </Link>

            <div className="text-[11px] text-white/35 mt-4 px-1 leading-relaxed">
              Les montants affichés sont réels : ils proviennent de tes transactions. Tant que tu n'as
              pas vendu ou touché de commission, ils restent à 0 €.
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
