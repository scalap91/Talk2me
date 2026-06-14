'use client';

/** Talk2Me — Shop › Offres. Honnête : pas de fausse promo, on renvoie au Shop. */
import { useRouter } from 'next/navigation';
import { Ticket } from 'lucide-react';
import ShopPageShell from '@/components/boutique/ShopPageShell';

export default function OffresPage() {
  const router = useRouter();
  return (
    <ShopPageShell title="Offres">
      <div className="flex flex-col items-center justify-center text-center py-20 text-white/45">
        <Ticket className="w-10 h-10 mb-3 text-white/30" />
        <p className="text-[14px]">Les offres arrivent bientôt.</p>
        <p className="text-[12px] mt-1 text-white/35">Promos et bons plans sur les boutiques.</p>
        <button
          onClick={() => router.push('/home?hub=shop')}
          className="mt-5 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-[14px] font-semibold active:scale-95"
        >
          Parcourir le Shop
        </button>
      </div>
    </ShopPageShell>
  );
}
