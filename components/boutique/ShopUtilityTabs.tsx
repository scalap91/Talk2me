'use client';

/**
 * Talk2Me — Rangée d'onglets utilitaires du Shop (#429, Pascal 2026-06-08).
 * Inspiré TikTok Shop : Offres · Historique · Adresse · Paiement · Aide.
 * Version dark premium. Chaque onglet → sa page /shop/<x>.
 */

import Link from 'next/link';
import { Ticket, Clock, MapPin, CreditCard, HelpCircle } from '@/lib/icons';

const TABS = [
  { key: 'offres', label: 'Offres', icon: Ticket, href: '/shop/offres' },
  { key: 'historique', label: 'Historique', icon: Clock, href: '/shop/historique' },
  { key: 'adresse', label: 'Adresse', icon: MapPin, href: '/shop/adresse' },
  { key: 'paiement', label: 'Paiement', icon: CreditCard, href: '/shop/paiement' },
  { key: 'aide', label: 'Aide', icon: HelpCircle, href: '/shop/aide' },
];

export default function ShopUtilityTabs() {
  return (
    <div className="flex items-start justify-between px-2 py-3">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="flex flex-1 flex-col items-center gap-1.5 text-white/75 hover:text-white transition-colors active:scale-95"
          >
            <span className="grid place-items-center w-11 h-11 rounded-full bg-white/[0.06] border border-white/10">
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.9} />
            </span>
            <span className="text-[11px] font-medium">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
