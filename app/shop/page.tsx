'use client';

/**
 * Talk2Me — Shop (Pascal 2026-06-20).
 * Reprend tout le contenu de l'ex-onglet « Acheter » du Hub (Boutiques + Eat +
 * Annonces via AcheterHub). Accessible depuis l'icône Shop du menu du bas.
 * L'onglet « Acheter » du Hub a été retiré → tout passe par ici.
 */
import { useRouter } from 'next/navigation';
import AcheterHub from '@/components/feed/AcheterHub';

export default function ShopPage() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-[60] bg-[#0e0e12]">
      <AcheterHub onBack={() => router.push('/home')} />
    </div>
  );
}
