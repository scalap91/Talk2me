'use client';

/**
 * Talk2Me — Vitrine de rendu des Cards (Pascal 2026-07-01).
 * Montre comment le MOTEUR UNIQUE (SuperCardView) rend chaque type de card,
 * ISOLÉ du feed : rien n'est stocké, rien ne se propage. Juste pour voir.
 */
import SuperCardView from '@/components/cards/SuperCardView';
import { makeCard, type SuperCard } from '@/lib/cards/supercard';

const CARDS: { label: string; card: SuperCard }[] = [
  { label: '🎵 Vidéo / Musique', card: makeCard({
    id: 'demo_yt', types: ['audio', 'video'], title: 'Chris Brown — Under the Influence',
    video: { url: 'https://youtu.be/wWR0VD6qgt8', embed: 'https://www.youtube.com/embed/wWR0VD6qgt8' },
    images: ['https://i.ytimg.com/vi/wWR0VD6qgt8/hqdefault.jpg'], source: { name: 'Chris Brown', label: 'YouTube' },
  }) },
  { label: '🍲 Recette', card: makeCard({
    id: 'demo_recipe', types: ['recipe'], title: 'Couscous royal maison',
    images: ['https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800'],
    text: { body: 'Le grand classique convivial, viandes et légumes mijotés.' },
    specs: { Préparation: '45 min', Portions: '6 personnes', Difficulté: 'Moyen' },
    link: { url: 'https://www.marmiton.org/', reader: 'preview' }, source: { name: 'Marmiton', label: 'Recette' },
  }) },
  { label: '🍴 Lieu / Restaurant', card: makeCard({
    id: 'demo_place', types: ['place'], title: 'La Villa des Épices',
    images: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800'],
    place: { lat: 31.6295, lng: -7.9811, address: '12 rue de la Kasbah' },
    categories: ['Restaurant'], specs: { Cuisine: 'Marocaine', Distance: '420 m', Téléphone: '+212 5 24 00 00 00' },
    link: { url: 'https://www.openstreetmap.org/', reader: 'preview' }, source: { name: 'OpenStreetMap', label: 'Lieu' },
  }) },
  { label: '🛍 Produit', card: makeCard({
    id: 'demo_prod', types: ['product'], channel: 'boutique', title: 'Casque audio sans fil Bluetooth',
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'],
    specs: { Prix: '89 000 Ar', État: 'neuf' },
    link: { url: 'https://www.aliexpress.com/', reader: 'preview' }, source: { name: 'AliExpress', label: 'Produit' },
  }) },
  { label: '🌤 Météo', card: makeCard({
    id: 'demo_weather', types: ['link'], title: 'Antananarivo — Ensoleillé',
    place: { lat: -18.8792, lng: 47.5079 },
    specs: { Température: '27°C', Ressenti: '29°C', Vent: '12 km/h', Humidité: '55 %' }, source: { name: 'Open-Meteo', label: 'Météo' },
  }) },
  { label: '📖 Article / Wiki', card: makeCard({
    id: 'demo_wiki', types: ['article'], title: 'Madagascar',
    images: ['https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Baobab_Avenue.jpg/320px-Baobab_Avenue.jpg'],
    text: { body: "État insulaire de l'océan Indien, 4e plus grande île du monde." },
    link: { url: 'https://fr.wikipedia.org/wiki/Madagascar', reader: 'preview' }, source: { name: 'Wikipédia', label: 'Article' },
  }) },
];

export default function CardsDemoPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0b0b0f', color: '#e7e9ee', padding: '16px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 2px' }}>Vitrine Cards</h1>
      <p style={{ fontSize: 13, color: '#8b90a0', marginBottom: 16 }}>Chaque type rendu par le moteur unique — isolé du feed, rien n&apos;est stocké.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {CARDS.map(({ label, card }) => (
          <div key={card.id}>
            <div style={{ fontSize: 12, color: '#8b90a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
            <SuperCardView card={card} variant="social" />
          </div>
        ))}
      </div>
    </main>
  );
}
