'use client';
/**
 * Aperçu PUBLIC — FEED joué par LA MACHINE : chaque post = un papier (SuperCard)
 * rendu par SuperCardView (theme light, variant social). Le LECTEUR pose l'entête
 * auteur + la barre sociale autour. Preview de l'option A (unification) avant
 * bascule du vrai feed. Placeholders de démo (picsum/embed public). À supprimer après.
 */
import SuperCardView from '@/components/cards/SuperCardView';
import { CARD_FORMAT, type SuperCard } from '@/lib/cards/supercard';

const BADGE: Record<string, { label: string; color: string }> = {
  video: { label: 'VIDÉO', color: '#7C5CFF' }, image: { label: 'PHOTO', color: '#FF7F11' },
  social_post: { label: 'POST', color: '#6A7585' }, room: { label: 'SALLE 3D', color: '#FF7F11' },
};

function FeedCard({ card, who, avatar }: { card: SuperCard; who: string; avatar?: string }) {
  const t = card.types[0] || 'social_post';
  const b = BADGE[t] || { label: 'CARD', color: '#2F343A' };
  return (
    <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12 }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(45deg,#FF7F11,#7C5CFF)', marginRight: 12 }} />}
        <div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 16, color: '#2F343A' }}>{who}</div>
          <div style={{ fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 999, marginTop: 4, background: `${b.color}1a`, color: b.color, display: 'inline-block' }}>{b.label}</div>
        </div>
      </div>
      <SuperCardView card={card} theme="light" variant="social" />
      <div style={{ display: 'flex', gap: 16, marginTop: 12, color: '#6A7585', fontFamily: "'Inter',sans-serif", fontSize: 14 }}>
        <span>🤍 0</span><span>💬 0</span><span>↗ Partager</span>
      </div>
    </div>
  );
}

const base = { format: CARD_FORMAT, spec: 1, visibility: 'public' as const };
const samples: { card: SuperCard; who: string; avatar?: string }[] = [
  { who: 'Léa', card: { ...base, id: 's1', types: ['image', 'social_post'], title: 'Coucher de soleil 🌅', images: ['https://picsum.photos/seed/t2msun/800/1000'], text: { body: 'Coucher de soleil sur la plage.' }, source: { name: 'Léa' } } },
  { who: 'Sam', card: { ...base, id: 's2', types: ['video', 'social_post'], title: 'Ma vidéo', video: { embed: 'https://www.youtube.com/embed/dQw4w9WgXcQ', aspect: '16 / 9' }, text: { body: 'Regarde ça 🎬' }, source: { name: 'Sam' } } },
  { who: 'Pascal', card: { ...base, id: 's3', types: ['social_post'], title: 'Quelqu’un connaît un bon resto malgache à Tana ?', text: { body: 'Quelqu’un connaît un bon resto malgache à Tana ?' }, source: { name: 'Pascal' } } },
  { who: 'Marc', card: { ...base, id: 's4', types: ['video', 'social_post'], title: '', video: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', aspect: '16 / 9' }, text: { body: 'Ma vidéo fichier 🎥' }, source: { name: 'Marc' } } },
];

export default function ApercuFeedMachine() {
  return (
    <div style={{ minHeight: '100svh', background: '#F5F6F8', padding: '20px 16px' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        {samples.map((s) => <FeedCard key={s.card.id} {...s} />)}
      </div>
    </div>
  );
}
