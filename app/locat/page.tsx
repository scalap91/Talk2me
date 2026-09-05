'use client';

/**
 * Talk2Me — LOCAT👀 : marketplace de LOCATION de biens (robe de mariée, sono, bétonnière…).
 * RECYCLE le storefront SHEIN (SheinStore) — même grille, même fiche, même lecteur Boutique —
 * branché sur le catalogue des biens à louer (/api/locat/store = shop_products rental=1).
 * Le tarif+unité s'affiche via price_label (« … / jour »). Bouton « Louer » + calendrier : tranches suivantes.
 */
import { useRouter } from 'next/navigation';
import SheinStore from '@/components/shop/SheinStore';
import ShopNav from '@/components/shop/ShopNav';

export default function LocatPage() {
  const router = useRouter();
  return (
    // Aligné sur le natif (AcheterHub annonces.dart) : menu marketplace EN HAUT (ShopNav),
    // AUCUNE barre du bas (le natif = SafeArea(bottom:false), pas de BottomNav sur le hub).
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <ShopNav locat />
      <div className="flex-1 min-h-0 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-y-auto bg-[var(--t2m-paper)]">
        <SheinStore endpoint="/api/locat/store" rental onBack={() => router.push('/home')} />
      </div>
    </div>
  );
}
