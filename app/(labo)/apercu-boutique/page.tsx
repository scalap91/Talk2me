'use client';
/**
 * /apercu-boutique — DÉMO card-conteneur (Pascal 2026-07-03).
 * Une boutique = une card qui EMBARQUE ses produits (cards dans la card), rendue
 * par le lecteur unique SuperCardView en variant="boutique". Additif, ne touche à rien.
 */
import SuperCardView from '@/components/cards/SuperCardView';
import type { SuperCard } from '@/lib/cards/supercard';

const prod = (id: string, title: string, img: string, amount: number): SuperCard =>
  ({
    format: 't2m.card', spec: 1, id, version: 1, state: 'published',
    title, types: ['product'], owner: 'demo',
    images: [img], price: { amount, currency: 'MGA' },
    actions: [{ kind: 'buy', label: 'Acheter' }],
  } as unknown as SuperCard);

const DEMO: SuperCard = {
  format: 't2m.card', spec: 1, id: 'demo-boutique', version: 1, state: 'published',
  title: 'Chez Mama Sofia', types: ['boutique'], owner: 'demo',
  images: ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800'],
  text: { body: 'Plats faits maison du quartier · livraison 500 m' },
  items: [
    prod('p1', 'Riz au poulet', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400', 8000),
    prod('p2', 'Poisson braisé', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400', 12000),
    prod('p3', 'Brochettes zébu', 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400', 6000),
    prod('p4', 'Samoussas x5', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', 3000),
  ],
} as unknown as SuperCard;

export default function ApercuBoutique() {
  // Rendu PLEIN ÉCRAN — exactement comme la branche boutique de PostShell (fond sombre, scroll).
  return (
    <div style={{ height: '100dvh', width: '100%', overflowY: 'auto', background: '#0b0b0d', padding: 12 }}>
      <SuperCardView card={DEMO} variant="boutique" theme="dark" />
    </div>
  );
}
