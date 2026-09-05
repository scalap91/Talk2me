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
    // Aligné natif (AcheterHub annonces.dart) : nav marketplace EN HAUT (ShopNav), AUCUNE
    // barre du bas (le natif = SafeArea(bottom:false)). Retour via la barre / le back de la section.
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <ShopNav />
      <div className="flex-1 min-h-0 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-hidden bg-[var(--t2m-paper)]">
        <AcheterHub onBack={() => router.push('/home')} />
      </div>
    </div>
  );
}
