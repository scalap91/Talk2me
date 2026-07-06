'use client';
/**
 * Aperçu PUBLIC — rend le VRAI composant AlignedPostCard avec un post SALLE 3D
 * ([PIECE3D]) pour montrer la RoomCard qui remplace le post-photo moche.
 * Données d'exemple (couverture vide → fallback dégradé, pas d'image inventée).
 * À supprimer après validation.
 */
import AlignedPostCard from '@/components/feed/AlignedPostCard';
import type { FeedItem } from '@/components/feed/PostFeed';

const salle = {
  kind: 'image_card', id: 'demo-piece', user_id: 'demo',
  caption: 'Visite ma salle 3D [PIECE3D]',
  media_url: null,
  likes: 12, comment_count: 3, liked_by_me: false,
  author: { display_name: 'Pascal', username: 'pascal', avatar_url: null },
} as unknown as FeedItem;

// Post normal → doit être joué par la MACHINE (SuperCardView) après la bascule.
const photo = {
  kind: 'image_card', id: 'demo-photo', user_id: 'demo',
  caption: 'Coucher de soleil sur la plage 🌅',
  media_url: 'https://picsum.photos/seed/t2msun/800/1000',
  likes: 5, comment_count: 1, liked_by_me: false,
  author: { display_name: 'Léa', username: 'lea', avatar_url: null },
} as unknown as FeedItem;

export default function ApercuRoomFeed() {
  return (
    <div style={{ minHeight: '100svh', background: '#F5F6F8', padding: '20px 16px' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <AlignedPostCard item={photo} />
        <AlignedPostCard item={salle} />
      </div>
    </div>
  );
}
