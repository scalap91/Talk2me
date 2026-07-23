'use client';
/**
 * PlanCard — LE PEINTRE WEB piloté par le PLAN serveur (Pascal 2026-07-22).
 *
 * Ne DÉCIDE rien : reçoit le PLAN (`FeedCardPlan`) et le peint. La RÉFÉRENCE VISUELLE est le NATIF
 * (`album_card.dart`) : les cartes film/album sont PLEIN ÉCRAN IMMERSIVES (fond = affiche floutée +
 * voile #0E0C13, contenu centré, police Outfit, accent #FF7F11). On reproduit ce design ICI au pixel.
 */
import { useState, createContext, useContext } from 'react';
import type { FeedCardPlan } from '@/lib/cards/plan/feed-plan';
import { useCardInteractions, type CardKind } from '@/lib/feed/use-card-interactions';

const ACCENT = '#FF7F11';
const OUTFIT = "'Outfit', system-ui, sans-serif";

/** Interactions réelles injectées par le feed (like/comment/share). null = aperçu statique. */
type Inter = ReturnType<typeof useCardInteractions>;
const InterCtx = createContext<Inter | null>(null);

/** Carte FILM — reproduction fidèle du `FilmCard` natif (plein écran immersif). */
function FilmPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  const poster = m?.poster;
  const trailer = m?.trailer || m?.url;
  const [playing, setPlaying] = useState(false);
  const director = plan.envelope.author.name;
  const price = plan.content.priceDisplay;
  const vertical = (m?.aspect || '').replace(/\s/g, '') === '9/16';

  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: '#15131C' }}>
      {/* Fond = affiche floutée */}
      {poster && <img src={poster} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px)', transform: 'scale(1.15)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,12,19,0.93)' }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: '48px 22px calc(env(safe-area-inset-bottom) + 84px)', maxWidth: 460, margin: '0 auto' }}>
        {/* Miniature (16/9 ou 9/16) + bouton play */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: vertical ? '9 / 16' : '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#2A2340' }}>
          {playing && trailer
            ? <video src={trailer} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            : <>
                {poster
                  ? <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 50 }}>🎬</div>}
                <button onClick={() => setPlaying(true)} aria-label="Lire la bande-annonce"
                  style={{ position: 'absolute', inset: 0, margin: 'auto', width: 62, height: 62, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.7)', color: '#fff', fontSize: 30, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>▶</button>
              </>}
        </div>

        <div style={{ height: 18 }} />
        <h2 style={{ fontFamily: OUTFIT, color: '#fff', fontSize: 23, fontWeight: 900, textAlign: 'center', lineHeight: 1.1, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{plan.content.title || 'Film'}</h2>
        <div style={{ height: 4 }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>{director}</span>
          <span style={{ color: ACCENT, fontSize: 10, fontWeight: 800, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', borderRadius: 20, padding: '2px 8px' }}>🎬 FILM</span>
        </div>
        {plan.content.body && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5, lineHeight: 1.5, textAlign: 'center', margin: '14px 0 0', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{plan.content.body}</p>}

        <div style={{ flex: 1 }} />

        <button onClick={() => setPlaying(true)} style={{ width: '100%', height: 48, borderRadius: 14, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.38)', fontFamily: OUTFIT, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>▶ Regarder la bande-annonce</button>
        <div style={{ height: 10 }} />
        <button style={{ width: '100%', height: 50, borderRadius: 14, background: ACCENT, color: '#fff', border: 0, fontFamily: OUTFIT, fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
          {price ? `Acheter le film · ${price}` : 'Acheter le film'}
        </button>
      </div>
    </section>
  );
}

/** Carte ALBUM — reproduction fidèle du `AlbumCard` natif (plein écran immersif, aperçu 30 s). */
function AlbumPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  const cover = m?.poster || (m?.type === 'image' ? m?.url : undefined);
  const tracks = m?.tracks ?? [];
  const artist = plan.envelope.author.name;
  const price = plan.content.priceDisplay;
  const mine = plan.envelope.isOwner;
  const [idx, setIdx] = useState(-1);
  const audioRef = useState<HTMLAudioElement | null>(null);

  const play = (i: number) => {
    const url = tracks[i]?.url;
    if (!url) return;
    let a = audioRef[0];
    if (!a) { a = new Audio(); audioRef[1](a); a.addEventListener('timeupdate', () => { if (!mine && a!.currentTime >= 30) { a!.pause(); } }); }
    if (idx === i && !a.paused) { a.pause(); setIdx(-1); return; }
    a.src = url; a.currentTime = 0; a.play().catch(() => {}); setIdx(i);
  };

  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: '#15131C' }}>
      {cover && <img src={cover} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.15)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,12,19,0.9)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: '48px 20px calc(env(safe-area-inset-bottom) + 84px)', maxWidth: 460, margin: '0 auto' }}>
        {/* Pochette carrée */}
        <div style={{ alignSelf: 'center', width: 190, height: 190, borderRadius: 16, overflow: 'hidden', background: '#2A2340', display: 'grid', placeItems: 'center' }}>
          {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 60, color: 'rgba(255,255,255,0.25)' }}>💿</span>}
        </div>
        <div style={{ height: 16 }} />
        <h2 style={{ fontFamily: OUTFIT, color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.content.title || 'Album'}</h2>
        <div style={{ height: 2 }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{artist}</span>
          <span style={{ color: ACCENT, fontSize: 10, fontWeight: 800, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>🎵 ALBUM</span>
        </div>
        <div style={{ height: 16 }} />
        {/* Pistes */}
        <div style={{ flex: 1 }}>
          {tracks.map((t, i) => {
            const active = idx === i;
            return (
              <button key={i} onClick={() => play(i)} style={{ display: 'flex', alignItems: 'center', width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '11px 0', textAlign: 'left' }}>
                <span style={{ width: 26, color: active ? ACCENT : 'rgba(255,255,255,0.54)', fontSize: 18 }}>{active ? '❚❚' : '▷'}</span>
                <span style={{ flex: 1, color: active ? '#fff' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: active ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || `Piste ${i + 1}`}</span>
                {!mine && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginRight: 8 }}>30s</span>}
                <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>{t.duration || ''}</span>
              </button>
            );
          })}
        </div>
        {/* Acheter */}
        {mine
          ? <div style={{ height: 50, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', color: ACCENT, fontFamily: OUTFIT, fontWeight: 800 }}>🎵 Créé par moi</div>
          : <button style={{ width: '100%', height: 50, borderRadius: 14, background: ACCENT, color: '#fff', border: 0, fontFamily: OUTFIT, fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>{price ? `Acheter l'album · ${price}` : "Acheter l'album"}</button>}
      </div>
    </section>
  );
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/** Rail social — boutons RÉELS si le feed a injecté les interactions (InterCtx), statique sinon. */
function PlanSocialBar({ likes, comments, color = '#fff' }: { likes: number; comments: number; color?: string }) {
  const inter = useContext(InterCtx);
  const base = { background: 'none', border: 0, fontWeight: 600, fontSize: 13, padding: 0, cursor: inter ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 4 } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 12 }}>
      <button type="button" onClick={inter?.toggleLike} style={{ ...base, color: inter?.liked ? ACCENT : color }}>{inter?.liked ? '❤' : '♥'} {fmtNum(inter ? inter.likes : likes)}</button>
      <button type="button" onClick={inter?.openComments} style={{ ...base, color }}>💬 {fmtNum(comments)}</button>
      <button type="button" onClick={inter?.share} style={{ ...base, color }}>↗ Partager</button>
    </div>
  );
}

/** Bas immersif PARTAGÉ (photo/vidéo) — calqué sur `_bottomBlock` natif : auteur + légende + rail social. */
function ImmersiveBottom({ plan }: { plan: FeedCardPlan }) {
  const a = plan.envelope.author;
  const st = plan.envelope.stats;
  const title = plan.content.title;
  const body = plan.content.body;
  return (
    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 44px)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {a.avatar
          ? <img src={a.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: ACCENT, border: '2px solid rgba(255,255,255,0.9)' }} />}
        <span style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 18, textShadow: '0 1px 6px rgba(0,0,0,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      </div>
      {(title || body) && (
        <div style={{ marginTop: 10 }}>
          {title && <div style={{ fontWeight: 700, fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>{title}</div>}
          {body && <div style={{ fontSize: 13.5, lineHeight: 1.4, marginTop: title ? 3 : 0, textShadow: '0 1px 6px rgba(0,0,0,0.6)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{body}</div>}
        </div>
      )}
      <PlanSocialBar likes={st.likes} comments={st.comments} />
    </div>
  );
}

/** Carte PHOTO — image plein écran immersive + bas (calqué sur la branche `variant='photo'` native). */
function PhotoPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: '#000' }}>
      {m?.url
        ? <img src={m.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, background: '#1c1c22' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.34) 26%, rgba(0,0,0,0) 54%)' }} />
      <ImmersiveBottom plan={plan} />
    </section>
  );
}

/** Carte VIDÉO — vidéo plein écran (autoplay muet) + bas immersif. */
function VideoPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  const src = m?.url;
  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: '#000' }}>
      {src
        ? <video src={src} poster={m?.poster} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : (m?.poster
            ? <img src={m.poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ position: 'absolute', inset: 0, background: '#1c1c22' }} />)}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.34) 26%, rgba(0,0,0,0) 54%)' }} />
      <ImmersiveBottom plan={plan} />
    </section>
  );
}

/** Carte AUDIO — un son (hors album) : pochette + lecture + bas immersif. */
function AudioPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  const cover = m?.poster;
  const url = m?.url || m?.tracks?.[0]?.url;
  const artist = plan.envelope.author.name;
  const [playing, setPlaying] = useState(false);
  const audioRef = useState<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!url) return;
    let a = audioRef[0];
    if (!a) { a = new Audio(url); audioRef[1](a); a.addEventListener('ended', () => setPlaying(false)); }
    if (playing) { a.pause(); setPlaying(false); } else { a.play().catch(() => {}); setPlaying(true); }
  };
  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: '#15131C' }}>
      {cover && <img src={cover} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(22px)', transform: 'scale(1.15)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,12,19,0.9)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100dvh', padding: '64px 20px calc(env(safe-area-inset-bottom) + 150px)', maxWidth: 460, margin: '0 auto' }}>
        <button onClick={toggle} style={{ position: 'relative', width: 220, height: 220, borderRadius: 20, overflow: 'hidden', background: '#2A2340', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          {cover ? <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 64, color: 'rgba(255,255,255,0.25)' }}>🎵</span>}
          <span style={{ position: 'relative', width: 60, height: 60, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.7)', color: '#fff', fontSize: 28, display: 'grid', placeItems: 'center' }}>{playing ? '❚❚' : '▶'}</span>
        </button>
        <div style={{ height: 18 }} />
        <h2 style={{ fontFamily: OUTFIT, color: '#fff', fontSize: 21, fontWeight: 900, textAlign: 'center', margin: 0 }}>{plan.content.title || 'Son'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>{artist}</span>
          <span style={{ color: ACCENT, fontSize: 10, fontWeight: 800, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', borderRadius: 20, padding: '2px 8px' }}>🎵 SON</span>
        </div>
      </div>
      <ImmersiveBottom plan={plan} />
    </section>
  );
}

/** Carte TEXTE — pas de média : fond sombre + bas immersif (auteur + texte + social), calqué natif. */
function TextePlan({ plan }: { plan: FeedCardPlan }) {
  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: 'linear-gradient(160deg, #201c38 0%, #0e0c13 100%)' }}>
      {plan.content.body && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 26px' }}>
          <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 19, lineHeight: 1.5, textAlign: 'center', fontFamily: OUTFIT, fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{plan.content.body}</p>
        </div>
      )}
      <ImmersiveBottom plan={plan} />
    </section>
  );
}

/** Carte BOUTIQUE — devanture + grille produits + Commander, calquée sur le natif (screenshot). */
function BoutiquePlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  const cover = m?.url || m?.poster;
  const a = plan.envelope.author;
  const st = plan.envelope.stats;
  const shopName = plan.content.title || a.name || 'Boutique';
  const products = plan.content.products ?? [];
  const kind = plan.content.shopKind || 'boutique';
  const isFood = kind === 'eat' || kind === 'plat_maison';
  const badge = kind === 'plat_maison' ? 'PLAT MAISON' : kind === 'eat' ? 'RESTO' : 'BOUTIQUE';
  const sectionLabel = isFood ? 'Les plats' : 'Les articles';
  const unit = isFood ? 'plat' : 'article';
  const cta = isFood ? '🍴 Commander' : 'Voir la boutique';
  return (
    <section style={{ position: 'relative', width: '100%', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Devanture */}
      <div style={{ position: 'relative', height: 250, flexShrink: 0, overflow: 'hidden' }}>
        {cover
          ? <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, background: '#1C1830' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.8) 100%)' }} />
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {a.avatar
              ? <img src={a.avatar} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }} />
              : <div style={{ width: 46, height: 46, borderRadius: '50%', background: ACCENT, border: '2px solid rgba(255,255,255,0.9)' }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 19, textShadow: '0 1px 6px rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shopName}</div>
              <span style={{ display: 'inline-block', marginTop: 2, color: '#fff', fontSize: 9.5, fontWeight: 800, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '2px 8px' }}>{badge}</span>
            </div>
          </div>
          <PlanSocialBar likes={st.likes} comments={st.comments} />
        </div>
      </div>
      {/* Grille produits */}
      <div style={{ flex: 1, padding: '16px 14px 100px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 18, color: '#1A1D21' }}>{sectionLabel}</span>
          <span style={{ color: '#8A94A0', fontSize: 13 }}>{products.length} {unit}{products.length > 1 ? 's' : ''}</span>
        </div>
        {products.length === 0
          ? <div style={{ color: '#8A94A0', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Aucun {unit} pour le moment.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {products.map((p, i) => (
                <div key={p.id || i} style={{ borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                  <div style={{ width: '100%', aspectRatio: '1', background: '#EDEFF2' }}>
                    {p.image && <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{ color: '#1A1D21', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ color: ACCENT, fontWeight: 800, fontSize: 15 }}>{p.price || ''}</span>
                      <span style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700 }}>+</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
      </div>
      {/* Commander (fixe bas) */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 16px calc(env(safe-area-inset-bottom) + 14px)', background: 'linear-gradient(to top, #fff 60%, rgba(255,255,255,0))', maxWidth: 460, margin: '0 auto' }}>
        <button style={{ width: '100%', height: 54, borderRadius: 16, background: ACCENT, color: '#fff', border: 0, fontFamily: OUTFIT, fontWeight: 800, fontSize: 16.5, cursor: 'pointer' }}>{cta}</button>
      </div>
    </section>
  );
}

/** Repli générique (autres types) — carte simple en colonne-téléphone, en attendant leur design natif. */
function GenericPlan({ plan }: { plan: FeedCardPlan }) {
  const m = plan.content.media[0];
  return (
    <div style={{ width: '100%', maxWidth: 460, margin: '0 auto 12px', background: '#0A0A0C', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {plan.envelope.author.avatar
          ? <img src={plan.envelope.author.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#333', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12 }}>{plan.envelope.author.name.charAt(0).toUpperCase()}</div>}
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, flex: 1 }}>{plan.envelope.author.name}</span>
      </div>
      {m?.type === 'image' && <img src={m.url} alt="" style={{ width: '100%', display: 'block' }} />}
      {m?.type === 'audio' && <div style={{ aspectRatio: '1', background: '#15151A' }}>{m.poster && <img src={m.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>}
      {plan.content.body && <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, padding: '8px 12px', margin: 0 }}>{plan.content.body}</p>}
    </div>
  );
}

export interface PlanFeedBinding { id: string; kind: CardKind; liked0?: boolean; likes0?: number }

export default function PlanCard({ plan, feed }: { plan: FeedCardPlan; feed?: PlanFeedBinding }) {
  // Interactions réelles quand le FEED les fournit (like/comment/share) ; aperçu = statique.
  const inter = useCardInteractions(
    feed?.id ?? plan.id,
    feed?.kind ?? 'direct_card',
    { liked0: feed?.liked0, likes0: feed?.likes0 ?? plan.envelope.stats.likes },
  );
  const body = plan.layout === 'film' ? <FilmPlan plan={plan} />
    : plan.layout === 'album' ? <AlbumPlan plan={plan} />
    : plan.layout === 'photo' ? <PhotoPlan plan={plan} />
    : plan.layout === 'video' ? <VideoPlan plan={plan} />
    : plan.layout === 'audio' ? <AudioPlan plan={plan} />
    : plan.layout === 'texte' ? <TextePlan plan={plan} />
    : plan.layout === 'boutique' ? <BoutiquePlan plan={plan} />
    : <GenericPlan plan={plan} />;
  return <InterCtx.Provider value={feed ? inter : null}>{body}</InterCtx.Provider>;
}
