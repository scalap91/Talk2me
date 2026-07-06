'use client';

/**
 * Talk2Me — Shop · Démo livraison (Pascal 2026-06-27). Simulation visuelle du
 * suivi de livraison (scooter resto→client, ETA, appel livreur, « Livré »).
 * Pour VOIR le déroulé sans passer une vraie commande. escrowId factice.
 */
import { useRouter } from 'next/navigation';
import DeliveryTracking from '@/components/feed/DeliveryTracking';

export default function DemoLivraisonPage() {
  const router = useRouter();
  return <DeliveryTracking escrowId="demo" restoName="Chez Mama (démo)" onClose={() => router.push('/shop')} />;
}
