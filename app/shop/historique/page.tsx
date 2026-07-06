'use client';

/** Talk2Me — Shop › Historique de commandes. État vide honnête (rien d'inventé). */
import { Clock } from '@/lib/icons';
import ShopPageShell from '@/components/boutique/ShopPageShell';

export default function HistoriquePage() {
  return (
    <ShopPageShell title="Historique">
      <div className="flex flex-col items-center justify-center text-center py-20 text-white/45">
        <Clock className="w-10 h-10 mb-3 text-white/30" />
        <p className="text-[14px]">Aucune commande pour l&apos;instant.</p>
        <p className="text-[12px] mt-1 text-white/35">Tes achats apparaîtront ici.</p>
      </div>
    </ShopPageShell>
  );
}
