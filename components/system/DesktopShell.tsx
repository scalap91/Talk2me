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
import { useEffect, useState } from 'react';
import { Globe, MessageSquare, Layers, ShoppingBag, Wallet, User, Plus, Search, Car } from '@/lib/icons';
import CreateCardSheet from '@/components/create/CreateCardSheet';
import BoutiqueQuickSheet from '@/components/create/BoutiqueQuickSheet';
import CreateServiceSheet from '@/components/create/CreateServiceSheet';
import CreateRencontreSheet from '@/components/create/CreateRencontreSheet';
import CreateEmploiSheet from '@/components/create/CreateEmploiSheet';
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet';
import AddRestaurantSheet from '@/components/feed/AddRestaurantSheet';
import DepositAnnonceSheet from '@/components/feed/DepositAnnonceSheet';

const NAV = [
  { icon: Globe, label: 'Hub', href: '/home' },
  { icon: Search, label: 'Rechercher', href: '/decouvrir' },
  { icon: MessageSquare, label: 'Discussions', href: '/friends' },
  { icon: User, label: 'Profil', href: '/profile' },
  { icon: Layers, label: 'Cards', href: '/drafts' },
  { icon: Wallet, label: 'Wallet', href: '/wallet' },
  { icon: ShoppingBag, label: 'Shop', href: '/shop' },
  { icon: Car, label: 'Drive', href: '/drive' },
];

// Écrans "nus" (plein écran, sans shell) : auth, vitrines publiques, embed.
const BARE = ['/signin', '/signup', '/auth', '/embed', '/b/', '/boutique/', '/coming'];

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  // Embarqué dans une iframe (panneau droit Discussions desktop) → pas de sidebar.
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => { try { if (window.self !== window.top) setInIframe(true); } catch { setInIframe(true); } }, []);
  // Composer desktop : le bouton « Créer » ouvre le MÊME sélecteur que le + mobile
  // (BottomNav est masquée en desktop → sinon pas d'accès aux tuiles, dont Formation/PDF).
  const [createOpen, setCreateOpen] = useState(false);
  const [boutiqueOpen, setBoutiqueOpen] = useState(false);
  const [platOpen, setPlatOpen] = useState(false);
  const [restoOpen, setRestoOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [rencontreOpen, setRencontreOpen] = useState(false);
  const [emploiOpen, setEmploiOpen] = useState(false);
  const [annonce, setAnnonce] = useState<null | { category?: string }>(null); // Annonce / Immobilier / Automobile
  if (inIframe || BARE.some((p) => pathname.startsWith(p))) return <>{children}</>;

  return (
    <>
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-[#0b0b0f] border-r border-white/8 z-40 p-3">
        <Link href="/home" className="flex items-center gap-2.5 px-2 py-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Talk2Me" className="w-9 h-9 rounded-xl" />
          <span className="text-white font-extrabold text-[18px] tracking-tight">Talk2Me</span>
        </Link>
        {/* Bouton CRÉER (la bulle rouge du composer) — la BottomNav étant masquée en
            desktop/tablette, on garde l'accès à la création ici. */}
        <button type="button" onClick={() => setCreateOpen(true)}
          className="flex items-center justify-center gap-2 mb-2 px-3 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-[14px] transition-colors">
          <Plus className="w-5 h-5" /> Créer
        </button>
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

      {/* Contenu : décalé à droite de la sidebar dès la tablette (md), intact sur mobile. */}
      <div className="md:pl-60">{children}</div>

      {/* Sélecteur « Créer une card » — même composant que le + mobile (tuile Formation → PDF). */}
      <CreateCardSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onBoutique={() => { setCreateOpen(false); setBoutiqueOpen(true); }}
        onPlat={() => { setCreateOpen(false); setPlatOpen(true); }}
        onRestaurant={() => { setCreateOpen(false); setRestoOpen(true); }}
        onService={() => { setCreateOpen(false); setServiceOpen(true); }}
        onEmploi={() => { setCreateOpen(false); setEmploiOpen(true); }}
        onRencontre={() => { setCreateOpen(false); setRencontreOpen(true); }}
        onArticle={() => { setCreateOpen(false); setAnnonce({}); }}
        onImmo={() => { setCreateOpen(false); setAnnonce({ category: 'Immobilier' }); }}
        onAuto={() => { setCreateOpen(false); setAnnonce({ category: 'Véhicules' }); }}
      />
      <BoutiqueQuickSheet open={boutiqueOpen} onClose={() => setBoutiqueOpen(false)} />
      <CreateServiceSheet open={serviceOpen} onClose={() => setServiceOpen(false)} />
      <CreateEmploiSheet open={emploiOpen} onClose={() => setEmploiOpen(false)} />
      <CreateRencontreSheet open={rencontreOpen} onClose={() => setRencontreOpen(false)} />
      {platOpen && <AddPlatMaisonSheet onClose={() => setPlatOpen(false)} onCreated={() => setPlatOpen(false)} />}
      {restoOpen && <AddRestaurantSheet onClose={() => setRestoOpen(false)} onCreated={() => setRestoOpen(false)} />}
      {annonce && <DepositAnnonceSheet initial={annonce.category ? { category: annonce.category } : undefined} onClose={() => setAnnonce(null)} onSaved={() => setAnnonce(null)} />}
    </>
  );
}
