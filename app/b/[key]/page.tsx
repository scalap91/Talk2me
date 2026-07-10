'use client';

/**
 * Talk2Me — Vue PUBLIQUE d'une petite boutique (lien partagé /b/<clé> ou story).
 * CÂBLAGE ACHAT (Pascal 2026-07-10) : la page ne faisait que « Contacter » → l'acheteur
 * qui arrivait par le lien ne pouvait RIEN acheter. On monte <BoutiqueSheet>, qui porte
 * déjà le rail d'achat complet (panier + Acheter → escrow protégé + paiement), le MÊME
 * que dans le feed. Aucune logique d'achat réécrite. [[modular-no-scattered-patches]]
 */

import { useParams, useRouter } from 'next/navigation';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';

export default function PublicShopPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/home');
  };
  return <BoutiqueSheet shopKey={String(key)} onClose={goBack} />;
}
