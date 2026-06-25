'use client';

/**
 * Talk2Me — SHELL DESKTOP (Pascal 2026-06-24). L'app est mobile-first (max-w-md).
 * Sur grand écran (lg+), on ajoute une barre latérale de navigation à gauche et on
 * décale le contenu : le PC ressemble enfin à une vraie appli, pas à une colonne vide.
 * Sur mobile : ce composant ne rend RIEN d'extra (l'app garde sa BottomNav).
 * Zéro impact sur les 47 écrans : on les enveloppe, on ne les réécrit pas.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, MessageSquare, Layers, ShoppingBag, Wallet, User } from 'lucide-react';

const NAV = [
  { icon: Globe, label: 'Hub', href: '/home' },
  { icon: MessageSquare, label: 'Discussions', href: '/friends' },
  { icon: User, label: 'Profil', href: '/profile' },
  { icon: Layers, label: 'Cards', href: '/drafts' },
  { icon: Wallet, label: 'Wallet', href: '/wallet' },
  { icon: ShoppingBag, label: 'Shop', href: '/shop' },
];

// Écrans "nus" (plein écran, sans shell) : auth, vitrines publiques, embed.
const BARE = ['/signin', '/signup', '/auth', '/embed', '/b/', '/boutique/', '/coming'];

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  if (BARE.some((p) => pathname.startsWith(p))) return <>{children}</>;

  return (
    <>
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-[#0b0b0f] border-r border-white/8 z-40 p-3">
        <Link href="/home" className="flex items-center gap-2.5 px-2 py-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Talk2Me" className="w-9 h-9 rounded-xl" />
          <span className="text-white font-extrabold text-[18px] tracking-tight">Talk2Me</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ icon: Icon, label, href }) => {
            const active = href === '/home' ? pathname.endsWith('/home') : pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors ' +
                  (active ? 'bg-white text-black font-semibold' : 'text-white/75 hover:bg-white/10')}>
                <Icon className="w-5 h-5" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 py-2 text-[11px] text-white/30">Talk2Me · le marché du peuple</div>
      </aside>

      {/* Contenu : décalé à droite de la sidebar sur desktop, intact sur mobile. */}
      <div className="lg:pl-60">{children}</div>
    </>
  );
}
