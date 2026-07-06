'use client';
/**
 * Aperçu PUBLIC — rend la RoomCard via le VRAI moteur SuperCardView (type 'room').
 * URL fraîche pour contourner le cache. Données d'exemple (structure réelle) ;
 * en prod l'adapter remplira images=[room_photo], source={name,icon}, text.body=
 * teaser music-wall, action open→/piece?u=owner. À supprimer après validation.
 */
import SuperCardView from '@/components/cards/SuperCardView';
import { CARD_FORMAT, type SuperCard } from '@/lib/cards/supercard';

const roomCard: SuperCard = {
  format: CARD_FORMAT,
  spec: 1,
  id: 'demo-room',
  types: ['room'],
  title: 'Salle de Pascal',
  owner: 'demo',
  text: { body: '4 vidéos au mur · playlist' },
  images: [],
  source: { name: 'Pascal', label: 'Pascal' },
  actions: [{ kind: 'open', label: 'Entrer dans ma salle', url: '/piece?u=demo' }],
  visibility: 'public',
};

export default function ApercuRoomCard() {
  return (
    <div style={{ minHeight: '100svh', background: '#F5F6F8', display: 'grid', placeItems: 'center', padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <SuperCardView card={roomCard} theme="light" variant="card" />
      </div>
    </div>
  );
}
