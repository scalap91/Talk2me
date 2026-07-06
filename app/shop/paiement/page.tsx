'use client';

/** Talk2Me — Shop › Paiement. Honnête : carte en préparation (rail à venir). */
import { CreditCard } from '@/lib/icons';
import ShopPageShell from '@/components/boutique/ShopPageShell';

export default function PaiementPage() {
  return (
    <ShopPageShell title="Paiement">
      <div className="flex flex-col items-center justify-center text-center py-20 text-white/45">
        <CreditCard className="w-10 h-10 mb-3 text-white/30" />
        <p className="text-[14px]">Paiement par carte en préparation.</p>
        <p className="text-[12px] mt-1 text-white/35 max-w-[260px]">
          Le règlement sécurisé arrive bientôt. En attendant, les boutiques se
          coordonnent directement avec leurs clients.
        </p>
      </div>
    </ShopPageShell>
  );
}
