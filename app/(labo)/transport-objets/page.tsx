'use client';
/**
 * LABO — « Transport d'objets » (TransportFeed) : board demande/offre SANS escrow (« matching/escrow =
 * brique suivante » selon sa doctrine). Parqué ici (Pascal 2026-08-10, Phase 4a) : hors build beta/store,
 * préservé en dev. Le canonique pour envoyer = shipments/escrow via /envoyer-colis.
 */
import { useRouter } from 'next/navigation';
import TransportFeed from '@/components/feed/TransportFeed';

export default function TransportObjetsLabo() {
  const router = useRouter();
  return <TransportFeed onBack={() => router.back()} />;
}
