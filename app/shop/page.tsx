'use client';

/**
 * Talk2Me — Shop (Pascal 2026-06-20 ; barre de nav façon Temu 2026-06-27).
 * Accueil du Shop (AcheterHub : Boutiques + Eat + Annonces) + barre Shop
 * (Accueil/Catégories/Livraison/Panier/Vous) en bas mobile / haut desktop.
 */
import { useRouter } from 'next/navigation';
import AcheterHub from '@/components/feed/AcheterHub';
import ShopNav from '@/components/shop/ShopNav';

export default function ShopPage() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-[60] bg-[#08080b] flex flex-col">
      <ShopNav />
      {/* Desktop : on laisse un espace vide de part et d'autre (colonne centrée), pas collé aux bords. */}
      <div className="flex-1 min-h-0 pb-16 md:pb-0 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-white/8 overflow-hidden bg-[#0e0e12]">
        <AcheterHub onBack={() => router.push('/home')} />
      </div>
    </div>
  );
}
