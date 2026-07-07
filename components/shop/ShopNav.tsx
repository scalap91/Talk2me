'use client';

/**
 * Talk2Me — Barre de navigation du SHOP (Pascal 2026-06-27, façon Temu).
 * Accueil · Catégories · Livraison · Panier · Vous.
 * BAS sur mobile (barre fixe), HAUT sur desktop (barre sticky). Le badge Panier
 * reflète le store. À placer dans chaque page Shop (penser au padding bas mobile).
 */
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Truck, ShoppingCart, Store, UtensilsCrossed, Tag, Wrench, Briefcase, Car } from '@/lib/icons';
import { useCart } from '@/lib/boutique-cart-store';

// Icône « Catégories » alternative = 4 RONDS (pour la boutique Shein, dont les catégories
// sont des bulles rondes). Même style outline que LayoutGrid (4 carrés). Pascal 2026-07-07.
function FourCircles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <circle cx="7.5" cy="7.5" r="3" />
      <circle cx="16.5" cy="7.5" r="3" />
      <circle cx="7.5" cy="16.5" r="3" />
      <circle cx="16.5" cy="16.5" r="3" />
    </svg>
  );
}

const ITEMS = [
  // « Boutique » (icône magasin) au lieu de « Accueil » (maison) → plus de doublon visuel
  // avec le Hub (maison) de la nav app du bas. Pascal 2026-07-07.
  { href: '/shop', label: 'Boutique', icon: Store, match: (p: string) => p === '/shop' },
  { href: '/shop/categories', label: 'Catégories', icon: LayoutGrid, match: (p: string) => p.startsWith('/shop/categories') },
  { href: '/shop/historique', label: 'Livraison', icon: Truck, match: (p: string) => p.startsWith('/shop/historique') },
  { href: '/shop/panier', label: 'Panier', icon: ShoppingCart, match: (p: string) => p.startsWith('/shop/panier'), badge: true },
  // « Vous » RETIRÉ (Pascal 2026-07-07) : doublon avec « Profil » (nav app du bas). Le
  // compte boutique (commandes/adresses/suivi) est assemblé dans /profile → « Ma boutique ».
];

export default function ShopNav() {
  const pathname = usePathname() || '';
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));
  // Section Shop active (t2m_shop_section) → menu CONTEXTUEL. Relu à chaque page Shop.
  const [section, setSection] = useState('boutiques');
  useEffect(() => {
    try { setSection(sessionStorage.getItem('t2m_shop_section') || 'boutiques'); } catch { /* */ }
  }, [pathname]);
  // Icône Catégories : 4 ronds dans Shein (bulles rondes), 4 carrés ailleurs.
  const catIcon = (section === 'boutiques' ? FourCircles : LayoutGrid) as typeof Home;
  // 1er item = accueil de la SECTION active : logo + label contextuels (Eat 🍴, Boutique 🏪…).
  const HOME_BY_SECTION: Record<string, { label: string; icon: typeof Home }> = {
    boutiques: { label: 'Boutique', icon: Store },
    plats: { label: 'Eat', icon: UtensilsCrossed },
    annonces: { label: 'Annonces', icon: Tag },
    services: { label: 'Services', icon: Wrench },
    emploi: { label: 'Emploi', icon: Briefcase },
    location: { label: 'Location', icon: Car },
    immobilier: { label: 'Immobilier', icon: Home },
  };
  const home = HOME_BY_SECTION[section] || HOME_BY_SECTION.boutiques;

  const Item = ({ href, label, icon: Icon, match, badge, desktop }: { href: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: boolean; desktop?: boolean }) => {
    const active = match(pathname);
    return (
      <Link href={href} className={
        'relative flex items-center ' +
        (desktop
          ? 'gap-2 px-4 h-9 rounded-full text-[13.5px] ' + (active ? 'bg-[var(--t2m-ink)] text-white font-semibold' : 'text-[var(--t2m-ink-2)] hover:bg-[var(--t2m-wash)]')
          : 'flex-col gap-0.5 px-2 text-[11px] ' + (active ? 'text-[var(--t2m-primary)] font-semibold' : 'text-[var(--t2m-ink-2)]'))
      }>
        <Icon className={desktop ? 'w-4 h-4' : undefined} style={desktop ? undefined : { width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} />
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
      <nav className="hidden md:flex shrink-0 items-center justify-center gap-2 h-12 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]">
        {ITEMS.map((it) => <Item key={it.href} {...it} label={it.href === '/shop' ? home.label : it.label} icon={it.href === '/shop/categories' ? catIcon : it.href === '/shop' ? home.icon : it.icon} desktop />)}
      </nav>
      {/* MOBILE : barre en HAUT (design system, Pascal 2026-07-07) — blanche, en flux. */}
      <nav className="md:hidden shrink-0 flex items-center justify-around h-[68px] border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {ITEMS.map((it) => <Item key={it.href} {...it} label={it.href === '/shop' ? home.label : it.label} icon={it.href === '/shop/categories' ? catIcon : it.href === '/shop' ? home.icon : it.icon} />)}
      </nav>
    </>
  );
}
