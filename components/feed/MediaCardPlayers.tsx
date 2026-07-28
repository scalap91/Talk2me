'use client';
/**
 * Lecteurs ALBUM & FILM du feed web — sous-composants du LECTEUR UNIQUE (AlignedPostCard).
 * Ils lisent les facettes ÉTENDUES du `.card` (audio.tracks[] MP3, video.trailer/full, price),
 * introduites côté natif (Pascal 2026-07-17). AUCUN renderer trafiqué : on lit le `.card`.
 *
 * Le PRIX est affiché (informatif). L'encaissement réel (marketplace média, à l'auteur) reste
 * le rail commerce à câbler — pas de faux bouton d'achat ici (money = jamais de simulation).
 */
import { useRef, useState } from 'react';
import type { SuperCard } from '@/lib/cards/supercard';

function priceLabel(p?: SuperCard['price']): string | null {
  if (!p || typeof p.amount !== 'number' || p.amount <= 0) return null;
  const cur = p.currency || 'Ar';
  return `${p.amount.toLocaleString('fr-FR')} ${cur}`;
}

/** ALBUM : pochette + liste de pistes MP3 jouables (lecteur audio HTML5 natif). */
export function AlbumPlayer({ card, caption, isOwner }: { card: SuperCard; caption?: string; isOwner?: boolean }) {
  const tracks = (card.audio?.tracks || []).filter((t) => t && t.url);
  const cover = card.images?.[0] || card.audio?.thumbnail || '';
  const artist = card.audio?.author || '';
  const price = priceLabel(card.price);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cur, setCur] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);

  function toggle(i: number) {
    const a = audioRef.current;
    if (!a) return;
    if (cur === i && playing) { a.pause(); setPlaying(false); return; }
    if (cur !== i) { a.src = tracks[i].url; setCur(i); }
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  // Rendu IMMERSIF plein écran — reproduction fidèle de la carte album NATIVE (album_card.dart) :
  // pochette floutée en fond + voile #0E0C13, pochette 190 centrée, titre Outfit 22 w900, badge
  // 🎵 ALBUM orange, liste de pistes jouables, prix. Colonne-téléphone.
  return (
    <div style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#15131C' }}>
      {cover && <img src={cover} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(16px)', transform: 'scale(1.2)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,12,19,0.72)' }} />

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '40px 20px calc(96px + env(safe-area-inset-bottom))' }}>
        <div style={{ alignSelf: 'center', width: 190, height: 190, borderRadius: 16, overflow: 'hidden', background: '#2A2340' }}>
          {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 60 }}>🎵</div>}
        </div>
        <div style={{ height: 16 }} />
        <div style={{ fontFamily: "'Outfit',sans-serif", color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title || 'Album'}</div>
        <div style={{ height: 2 }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
          {artist && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist}</span>}
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap', color: '#FF7F11', fontSize: 10, fontWeight: 800, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', borderRadius: 20, padding: '2px 8px' }}>🎵 ALBUM</span>
        </div>
        {caption && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5, textAlign: 'center', margin: '10px 0 0', lineHeight: 1.4 }}>{caption}</div>}
        <div style={{ height: 16 }} />

        <div style={{ flex: 1 }}>
          {tracks.map((t, i) => (
            <button key={i} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '11px 0', textAlign: 'left' }}>
              <span style={{ width: 26, color: cur === i ? '#FF7F11' : 'rgba(255,255,255,0.54)', fontSize: 18, flexShrink: 0 }}>{cur === i && playing ? '❚❚' : '▶'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cur === i ? '#fff' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: cur === i ? 700 : 500 }}>{t.title || `Piste ${i + 1}`}</span>
              {price && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginRight: 8 }}>30s</span>}
              {t.duration && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>{t.duration}</span>}
            </button>
          ))}
        </div>

        {/* Comme le natif : MON album → « Créé par moi » ; sinon le prix (l'achat réel = barre d'actions de la carte,
            on ne met PAS un faux bouton qui n'encaisse pas — argent = jamais de leurre). */}
        {isOwner
          ? <div style={{ height: 50, marginTop: 8, borderRadius: 14, border: '1px solid rgba(255,127,17,0.5)', background: 'rgba(255,127,17,0.18)', color: '#FF7F11', display: 'grid', placeItems: 'center', fontFamily: "'Outfit',sans-serif", fontWeight: 800 }}>🎵 Créé par moi</div>
          : price ? <div style={{ textAlign: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 17, padding: '10px 0 2px' }}>{price}</div> : null}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}

/** FILM : lecteur bande-annonce (aperçu gratuit) + prix. Le film complet reste derrière l'achat. */
export function FilmPlayer({ card, caption }: { card: SuperCard; caption?: string }) {
  const trailer = card.video?.trailer || card.video?.url || '';
  const hasFull = !!card.video?.full;
  const cover = card.images?.[0] || '';
  const price = priceLabel(card.price);
  const synopsis = card.text?.body || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#000', color: '#fff' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
        {trailer ? (
          <video src={trailer} controls playsInline poster={cover || undefined} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : cover ? (
          <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18 }}>{card.title || 'Film'}</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: 'rgba(255,255,255,0.16)', padding: '2px 8px', borderRadius: 6 }}>{hasFull ? 'BANDE-ANNONCE' : 'FILM'}</span>
          {price ? <span style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80' }}>{price}</span> : null}
        </div>
        {synopsis ? <div style={{ fontSize: 14, color: '#D1D5DB', lineHeight: 1.4 }}>{synopsis}</div> : null}
        {hasFull && price ? <div style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>Film complet disponible à l’achat.</div> : null}
        {caption ? <div style={{ fontSize: 14, color: '#E5E7EB', marginTop: 2 }}>{caption}</div> : null}
      </div>
    </div>
  );
}
