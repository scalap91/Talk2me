'use client';

/** Talk2Me — Shop › Historique de commandes. État vide honnête (rien d'inventé). */
import { Clock } from '@/lib/icons';
import ShopPageShell from '@/components/boutique/ShopPageShell';

export default function HistoriquePage() {
  return (
    <ShopPageShell title="Historique">
      <div className="flex flex-col items-center justify-center text-center py-20 text-[var(--t2m-ink-3)]">
        <Clock className="w-10 h-10 mb-3 text-[var(--t2m-ink-3)]" />
        <p className="text-[14px] text-[var(--t2m-ink-2)]">Aucune commande pour l&apos;instant.</p>
        <p className="text-[12px] mt-1 text-[var(--t2m-ink-3)]">Tes achats apparaîtront ici.</p>
      </div>
    </ShopPageShell>
  );
}
