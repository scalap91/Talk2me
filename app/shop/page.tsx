'use client';

/**
 * Talk2Me — Shop (Pascal 2026-06-20 ; barre de nav façon Temu 2026-06-27).
 * Accueil du Shop (AcheterHub : Boutiques + Eat + Annonces) + barre Shop
 * (Accueil/Catégories/Livraison/Panier/Vous) en bas mobile / haut desktop.
 */
import { useRouter } from 'next/navigation';
import AcheterHub from '@/components/feed/AcheterHub';
import ShopNav from '@/components/shop/ShopNav';
import BottomNav from '@/components/chat/BottomNav';

export default function ShopPage() {
  const router = useRouter();
  return (
    // Design system (Pascal 2026-07-07) : coquille BLANCHE. Nav Shop en HAUT (ShopNav),
    // nav app en BAS (BottomNav) — comme la maquette.
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <ShopNav />
      {/* Desktop : colonne centrée, pas collée aux bords. pb pour la nav app du bas. */}
      <div className="flex-1 min-h-0 pb-16 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-hidden bg-[var(--t2m-paper)]">
        <AcheterHub onBack={() => router.push('/home')} />
      </div>
      <BottomNav />
    </div>
  );
}
