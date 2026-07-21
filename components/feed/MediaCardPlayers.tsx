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
export function AlbumPlayer({ card, caption }: { card: SuperCard; caption?: string }) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--t2m-card-bg)', color: 'var(--t2m-ink)' }}>
      <div style={{ display: 'flex', gap: 14, padding: 16, alignItems: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#0002' }}>
          {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title || 'Album'}</div>
          {artist ? <div style={{ color: 'var(--t2m-muted, #6A7585)', fontSize: 13, marginTop: 2 }}>{artist}</div> : null}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: 'var(--t2m-accent)', background: 'rgba(124,92,255,0.12)', padding: '2px 8px', borderRadius: 6 }}>ALBUM · {tracks.length} pistes</span>
            {price ? <span style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{price}</span> : null}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
        {tracks.map((t, i) => (
          <button key={i} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: cur === i ? 'rgba(124,92,255,0.06)' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--t2m-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{cur === i && playing ? '❚❚' : '▶'}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 14.5 }}>{t.title || `Piste ${i + 1}`}</span>
            {t.duration ? <span style={{ color: 'var(--t2m-muted, #9AA3AF)', fontSize: 12.5 }}>{t.duration}</span> : null}
          </button>
        ))}
      </div>
      {caption ? <div style={{ padding: '0 16px 14px', fontSize: 14, color: 'var(--t2m-ink)' }}>{caption}</div> : null}
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
