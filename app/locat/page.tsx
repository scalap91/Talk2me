'use client';

/**
 * Talk2Me — LOCAT👀 : marketplace de LOCATION de biens (robe de mariée, sono, bétonnière…).
 * RECYCLE le storefront SHEIN (SheinStore) — même grille, même fiche, même lecteur Boutique —
 * branché sur le catalogue des biens à louer (/api/locat/store = shop_products rental=1).
 * Le tarif+unité s'affiche via price_label (« … / jour »). Bouton « Louer » + calendrier : tranches suivantes.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SheinStore from '@/components/shop/SheinStore';
import ShopNav from '@/components/shop/ShopNav';

export default function LocatPage() {
  const router = useRouter();
  // PROXIMITÉ (Pascal 2026-09-06) : LOCAT = location de proximité. On affiche le catalogue tout de
  // suite, puis DÈS que la position est connue on bascule sur « 📍 Autour de moi » (trié du plus
  // proche au plus loin) en changeant l'endpoint → key force le remount+refetch de SheinStore.
  const [endpoint, setEndpoint] = useState('/api/locat/store');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setEndpoint(`/api/locat/store?lat=${p.coords.latitude}&lng=${p.coords.longitude}`),
      () => {}, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
  }, []);
  return (
    // Aligné sur le natif (AcheterHub annonces.dart) : menu marketplace EN HAUT (ShopNav),
    // AUCUNE barre du bas (le natif = SafeArea(bottom:false), pas de BottomNav sur le hub).
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <ShopNav locat />
      <div className="flex-1 min-h-0 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-y-auto bg-[var(--t2m-paper)]">
        <SheinStore key={endpoint} endpoint={endpoint} rental onBack={() => router.push('/home')} />
      </div>
    </div>
  );
}
