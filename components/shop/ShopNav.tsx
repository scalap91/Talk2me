'use client';

/**
 * Talk2Me — Barre de navigation du SHOP (Pascal 2026-06-27, façon Temu).
 * Accueil · Catégories · Livraison · Panier · Vous.
 * BAS sur mobile (barre fixe), HAUT sur desktop (barre sticky). Le badge Panier
 * reflète le store. À placer dans chaque page Shop (penser au padding bas mobile).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Truck, ShoppingCart, User } from '@/lib/icons';
import { useCart } from '@/lib/boutique-cart-store';

const ITEMS = [
  { href: '/shop', label: 'Accueil', icon: Home, match: (p: string) => p === '/shop' },
  { href: '/shop/categories', label: 'Catégories', icon: LayoutGrid, match: (p: string) => p.startsWith('/shop/categories') },
  { href: '/shop/historique', label: 'Livraison', icon: Truck, match: (p: string) => p.startsWith('/shop/historique') },
  { href: '/shop/panier', label: 'Panier', icon: ShoppingCart, match: (p: string) => p.startsWith('/shop/panier'), badge: true },
  { href: '/shop/vous', label: 'Vous', icon: User, match: (p: string) => p.startsWith('/shop/vous') },
];

export default function ShopNav() {
  const pathname = usePathname() || '';
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));

  const Item = ({ href, label, icon: Icon, match, badge, desktop }: { href: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: boolean; desktop?: boolean }) => {
    const active = match(pathname);
    return (
      <Link href={href} className={
        'relative flex items-center ' +
        (desktop
          ? 'gap-2 px-4 h-9 rounded-full text-[13.5px] ' + (active ? 'bg-white text-black font-semibold' : 'text-white/75 hover:bg-white/10')
          : 'flex-col gap-0.5 px-2 text-[11px] ' + (active ? 'text-red-400 font-semibold' : 'text-white/65'))
      }>
        <Icon className={desktop ? 'w-4 h-4' : 'w-6 h-6'} />
        <span>{label}</span>
        {badge && count > 0 && (
          <span className={(desktop ? 'ml-1 ' : 'absolute -top-1 right-1 ') + 'min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center'}>{count}</span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* DESKTOP : barre en HAUT */}
      <nav className="hidden md:flex shrink-0 items-center justify-center gap-2 h-12 border-b border-white/8 bg-[#0e0e12]/95 backdrop-blur-xl">
        {ITEMS.map((it) => <Item key={it.href} {...it} desktop />)}
      </nav>
      {/* MOBILE : barre en BAS (fixe) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[70] flex items-center justify-around h-16 border-t border-white/8 bg-[#0e0e12]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((it) => <Item key={it.href} {...it} />)}
      </nav>
    </>
  );
}
