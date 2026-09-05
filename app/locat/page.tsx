'use client';

/**
 * Talk2Me — LOCAT👀 : marketplace de LOCATION de biens (robe de mariée, sono, bétonnière…).
 * RECYCLE le storefront SHEIN (SheinStore) — même grille, même fiche, même lecteur Boutique —
 * branché sur le catalogue des biens à louer (/api/locat/store = shop_products rental=1).
 * Le tarif+unité s'affiche via price_label (« … / jour »). Bouton « Louer » + calendrier : tranches suivantes.
 */
import { useRouter } from 'next/navigation';
import SheinStore from '@/components/shop/SheinStore';
import BottomNav from '@/components/chat/BottomNav';

export default function LocatPage() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <div className="flex-1 min-h-0 pb-16 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-hidden bg-[var(--t2m-paper)]">
        <SheinStore endpoint="/api/locat/store" onBack={() => router.push('/home')} />
      </div>
      <BottomNav />
    </div>
  );
}
