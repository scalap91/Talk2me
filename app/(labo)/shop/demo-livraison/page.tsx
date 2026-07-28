'use client';

/**
 * Ancienne DÉMO de livraison (scooter simulé « Chez Mama ») — SUPPRIMÉE (Pascal 2026-07-26).
 * Le suivi est désormais RÉEL (Système B) : on redirige vers l'écran « Livraison » du profil.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DemoLivraisonPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/livraison'); }, [router]);
  return null;
}
