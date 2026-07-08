'use client';

/**
 * AlignedPostCard — POSE du travail de Gemini (design « L'Éclat du Quotidien »,
 * hub-gemini.html) + actions RÉELLES branchées : like (POST/DELETE /api/cards/[id]/like),
 * commentaires (event ttm:comments:open → CommentsHost global), partage (navigator.share).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FeedItem } from './PostFeed';
import SuperCardView from '@/components/cards/SuperCardView';
import MusicDiscCard from '@/components/cards/MusicDiscCard';
import { fromYouTube, fromPlace, fromRecipe } from '@/lib/cards/adapt';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';
import { Heart, ChatCircle, ShareNetwork, BookmarkSimple, Eye } from '@phosphor-icons/react';
import { motion } from 'motion/react';

// Card OS : le feed LIT le `.card`, POINT. Plus de reconstruction (fromPost supprimé).
// Pas de `.card` lisible → null → on affiche « illisible », on ne bricole pas.
function readAlignedCard(it: { dotcard?: string | null }): SuperCard | null {
  const dc = it.dotcard;
  if (typeof dc === 'string' && dc) {
    const r = parseCard(dc);
    if (r.ok && r.card) return r.card;
  }
  return null;
}

const BADGE: Record<string, { label: string; bg: string; color: string }> = {
  post: { label: 'PHOTO', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' },
  image_card: { label: 'PHOTO', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' },
  video_card: { label: 'VIDÉO', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' },
  boutique: { label: 'BOUTIQUE', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' },
};
const actionStyle = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Inter',sans-serif", fontSize: 14, color, background: 'none', border: 'none', padding: 0, cursor: 'pointer' });

// Badge d'ORIGINE (feed unique) — mappage partagé (header Cartes + verre poli Long).
const ORIGIN_BADGE: Record<string, { l: string; bg: string; c: string }> = {
  amis: { l: 'Amis', bg: 'rgba(124,92,255,0.12)', c: 'var(--t2m-accent)' },
  autour: { l: 'Autour', bg: 'rgba(0,126,58,0.12)', c: '#007E3A' },
  tout: { l: 'Tout', bg: 'rgba(106,117,133,0.12)', c: 'var(--t2m-ink-2)' },
};
// Badge « verre poli » posé SUR la photo (mode Long immersif).
const glassBadge: React.CSSProperties = { background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', border: '1px solid rgba(255,255,255,.45)', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)', fontSize: 12, fontWeight: 600, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start' };
// Prix formaté — même rendu que SuperCardView.priceLabel (MGA, aucune conversion silencieuse).
const fmtPrice = (p?: { amount?: number; currency?: string }): string => (p?.amount ? `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim() : '');

/** Une card est-elle une DEMI-card ? (YouTube ou petite boutique ≤8). Le feed s'en sert pour composer les cadres. */
export function isHalfItem(it: { dotcard?: string | null }): boolean {
  const card = readAlignedCard(it);
  return !!card && (!!card.video?.embed || (!!card.items?.length && card.items.length <= 8));
}

export default function AlignedPostCard({ item, forceSize, variant = 'cards' }: { item: FeedItem; forceSize?: 'full' | 'half'; variant?: 'cards' | 'long' }) {
  const it = item as unknown as {
    id: string; kind: string; caption?: string | null; text?: string | null; user_id?: string;
    media_url?: string | null; dotcard?: string | null; likes?: number; comment_count?: number; liked_by_me?: boolean;
    views?: number; is_owner?: boolean; origin?: 'amis' | 'autour' | 'tout';
    enrichment?: { snippet: string; contributors: number; path: string };
    messages?: Array<{ id: string; role?: string; content?: string; ai_name?: string | null;
      youtube?: import('@/lib/chat-types').YouTubeCardData | null;
      places?: import('@/lib/chat-types').PlaceCardData[] | null;
      recipe?: import('@/lib/chat-types').RecipeCardData | null }>;
    author?: { display_name?: string; username?: string; avatar_url?: string | null } | null;
  };
  // POST-CONVERSATION (Léa) : messages[] avec cards → rendus par la machine claire.
  const msgs = Array.isArray(it.messages) && it.messages.length > 0 ? it.messages : null;
  const a = it.author || {};
  const who = a.display_name || a.username || 'Utilisateur';
  const rawCaption = it.caption || it.text || '';
  // SALLE 3D : la card d'invitation porte le marqueur [PIECE3D] dans sa caption.
  const isPiece = it.kind !== 'video_card' && rawCaption.includes('[PIECE3D]');
  // Les marqueurs techniques ne s'affichent JAMAIS (fix « le tag qui fuit »).
  const caption = rawCaption.replace(/\s*\[(?:PIECE3D|PANO360|LEA360)\]|\s*\[VITRINE:[^\]]*\]/g, '').trim();
  // Une VITRINE boutique porte [VITRINE:id] dans son caption → badge BOUTIQUE (pas PHOTO). (Pascal 2026-07-06)
  const isBoutiqueVitrine = rawCaption.includes('[VITRINE:');
  const b = isPiece
    ? { label: 'SALLE 3D', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' }
    : isBoutiqueVitrine
    ? { label: 'BOUTIQUE', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' }
    : (BADGE[it.kind] || { label: 'CARD', bg: 'rgba(47,52,58,0.1)', color: 'var(--t2m-ink)' });
  const media = it.media_url || '';
  const cardKind = it.kind === 'post' ? 'post' : 'direct_card';

  // Fix TEMPORAIRE (Pascal 2026-07-03) : une card musique (attached_audio youtube) = DISQUE
  // dans le feed clair, en attendant le passage full .card.
  const musicAudio = (() => {
    const raw = (it as { attached_audio_json?: string | null }).attached_audio_json;
    if (!raw) return null;
    try {
      const a = JSON.parse(raw) as { type?: string; title?: string; author?: { name?: string }; thumbnail_url?: string; external_url?: string; description?: string };
      if (a?.type !== 'audio') return null;
      const vid = (String(a.external_url || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(a.thumbnail_url || '').match(/\/vi\/([A-Za-z0-9_-]{6,})\//) || [])[1];
      if (!vid) return null;
      return { video_id: vid, title: a.title || 'Musique', artist: a.author?.name || a.description || '', thumbnail: a.thumbnail_url || '' };
    } catch { return null; }
  })();

  // ── Mode Long immersif (image plein cadre, tout par-dessus) — choix du RENDU (Pascal 2026-07-06) ──
  // On lit le `.card` UNE fois (réutilisé par la branche par défaut) pour détecter une boutique.
  const alignedCard = readAlignedCard(it);
  const originInfo = it.origin ? ORIGIN_BADGE[it.origin] : null;
  // En mode Photo, la boutique reste IMMERSIVE (pas une carte au milieu du feed photo).
  const isLongBoutique = variant === 'long' && !msgs && !!alignedCard && !!alignedCard.items?.length;
  const isLongPhoto = variant === 'long' && !isLongBoutique && !msgs && !isPiece && !musicAudio && !isBoutiqueVitrine && it.kind !== 'video_card' && !!media;
  const longImmersive = isLongBoutique || isLongPhoto;
  // Boutique : id de vitrine pour ouvrir la boutique complète (route /boutique/[id]).
  const vitrineId = (rawCaption.match(/\[VITRINE:([^\]]+)\]/) || [])[1] || '';

  // ── actions réelles ──
  const [liked, setLiked] = useState(!!it.liked_by_me);
  const [likes, setLikes] = useState(it.likes ?? 0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [views, setViews] = useState(it.views ?? 0);
  const [toast, setToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const canSave = cardKind === 'direct_card' && !it.is_owner;

  // 🔖 Enregistrer (POST /api/cards/save) — redonné après bascule feed→machine.
  const toggleSave = useCallback(async () => {
    if (saving) return;
    if (saved) { setToast('Va dans Cards enregistrées'); setTimeout(() => setToast(null), 1600); return; }
    if (!canSave) { setToast('Enregistrement indisponible ici'); setTimeout(() => setToast(null), 1600); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/cards/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ card_kind: 'image_card', card_data: { id: it.id, kind: cardKind } }) });
      setToast(res.ok ? 'Enregistré' : 'Échec');
      if (res.ok) setSaved(true);
    } catch { setToast('Erreur réseau'); } finally { setSaving(false); setTimeout(() => setToast(null), 1600); }
  }, [saving, saved, canSave, it.id, cardKind]);

  // 👁 Vues : IntersectionObserver >2s → +1 (1×/card/session).
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const key = `talk2me:viewed:${cardKind}:${it.id}`;
    try { if (sessionStorage.getItem(key) === '1') return; } catch { /* */ }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          if (timer) continue;
          timer = setTimeout(() => {
            try { sessionStorage.setItem(key, '1'); } catch { /* */ }
            fetch(`/api/cards/${encodeURIComponent(it.id)}/views?kind=${cardKind}`, { method: 'POST', credentials: 'include' }).catch(() => {});
            setViews((v) => v + 1);
          }, 2000);
        } else if (timer) { clearTimeout(timer); timer = null; }
      }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [cardKind, it.id]);

  const toggleLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimiste
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(it.id)}/like?kind=${cardKind}`, { method: next ? 'POST' : 'DELETE' });
      const d = await res.json().catch(() => null);
      if (d && typeof d.likes === 'number') setLikes(d.likes);
      if (d && typeof d.liked === 'boolean') setLiked(d.liked);
    } catch {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); // rollback
    } finally { setBusy(false); }
  }, [busy, liked, it.id, cardKind]);

  const openComments = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ttm:comments:open', { detail: { kind: cardKind, id: it.id } }));
  }, [cardKind, it.id]);

  const share = useCallback(async () => {
    const url = `${location.origin}/home`;
    try {
      const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
      if (nav.share) await nav.share({ url, title: caption || 'T2M' });
      else { await navigator.clipboard?.writeText(url); }
    } catch { /* annulé */ }
  }, [caption]);

  // Entrer dans la salle 3D → stream la scène /piece (retour PILE sur ce post).
  const enterRoom = useCallback(() => {
    try { sessionStorage.setItem('t2m_piece_return', it.id); } catch { /* */ }
    window.location.assign('/piece?u=' + (it.user_id || ''));
  }, [it.id, it.user_id]);

  // PAGE-ENTITÉ VIVANTE (Pascal 2026-07-08) : une card avec un ARTICLE canonique derrière
  // le REFLÈTE — badge « 📖 Enrichi », extrait (si la légende est courte), lien « Lire l'article ».
  // AJOUT SEULEMENT : rien si `it.enrichment` absent (la majorité des cards). `dark` = posé sur média.
  const renderEnrichment = (dark: boolean) => {
    const enr = it.enrichment;
    if (!enr) return null;
    const nb = enr.contributors;
    const badgeLabel = '📖 Enrichi' + (nb > 0 ? ' · ' + nb + ' contributeur' + (nb > 1 ? 's' : '') : '');
    // On ne double pas l'info : extrait seulement si la légende est vide/courte.
    const showSnippet = !!enr.snippet && caption.trim().length < 80;
    const goArticle = (e: React.MouseEvent) => { e.stopPropagation(); window.location.assign(enr.path); };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        <span style={{
          alignSelf: 'flex-start', fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12,
          padding: '4px 9px', borderRadius: 999,
          background: dark ? 'rgba(255,255,255,.16)' : 'var(--t2m-wash)',
          color: dark ? '#fff' : 'var(--t2m-ink-2)',
          border: dark ? '1px solid rgba(255,255,255,.4)' : '1px solid var(--t2m-card-border)',
          textShadow: dark ? '0 1px 2px rgba(0,0,0,.5)' : undefined,
        }}>{badgeLabel}</span>
        {showSnippet && (
          <p style={{
            margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.4,
            color: dark ? 'rgba(255,255,255,.92)' : 'var(--t2m-ink-2)',
            textShadow: dark ? '0 1px 3px rgba(0,0,0,.55)' : undefined,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{enr.snippet}</p>
        )}
        <button type="button" onClick={goArticle} aria-label="Lire l'article de cette page-entité"
          style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13,
            color: dark ? '#fff' : 'var(--t2m-primary)',
            textShadow: dark ? '0 1px 3px rgba(0,0,0,.55)' : undefined,
          }}>Lire l&apos;article →</button>
      </div>
    );
  };

  return (
    <motion.div ref={cardRef}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-30px' }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={variant === 'long'
        // Style « Long » immersif : plein largeur, image bord-à-bord (padding 0 quand l'image
        // porte tout), séparé par un épais filet. Les types non-immersifs gardent leur padding.
        ? { position: 'relative', backgroundColor: 'var(--t2m-card-bg)', padding: longImmersive ? 0 : '16px 16px 20px', overflow: longImmersive ? 'hidden' : undefined, display: 'flex', flexDirection: 'column', borderBottom: 'none', scrollSnapAlign: 'start', scrollSnapStop: 'always' }
        // Style « Cartes » (actuel) : card blanche arrondie + ombre douce.
        : { position: 'relative', backgroundColor: 'var(--t2m-card-bg)', border: '1px solid var(--t2m-card-border)', borderRadius: 'var(--t2m-card-radius)', boxShadow: 'var(--t2m-card-shadow)', padding: 'var(--t2m-card-pad)', display: 'flex', flexDirection: 'column', marginBottom: 'var(--t2m-card-gap)' }}>
      {/* en-tête auteur — masqué en Long immersif (l'auteur est posé SUR l'image). */}
      {!longImmersive && (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        {a.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12, flexShrink: 0 }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(45deg,#FF7F11,#7C5CFF)', marginRight: 12, flexShrink: 0 }} />}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 16, color: 'var(--t2m-ink)' }}>{who}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 12, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start', backgroundColor: b.bg, color: b.color }}>{b.label}</div>
            {originInfo && <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start', backgroundColor: originInfo.bg, color: originInfo.c }}>{originInfo.l}</div>}
          </div>
        </div>
      </div>
      )}

      {isLongBoutique && alignedCard ? (
        /* ── BOUTIQUE en Photo immersif = CONFORME ARTÉFACT : une COVER (devanture) en haut avec
           avatar + nom boutique + badge BOUTIQUE posés dessus ; puis grille produits 2 col JOINTIVE
           (nom + prix en HAUT-GAUCHE sur l'image) ; bouton « Voir la boutique » verre poli à cheval en bas. ── */
        (() => {
          const card = alignedCard;
          const products = (card.items || []).slice(0, 4);
          const cover = card.images?.[0] || media || products[0]?.images?.[0] || '';
          const shopName = card.title || who;
          const openShop = () => { if (vitrineId) window.location.assign('/boutique/' + vitrineId); };
          return (
            // TAILLES FIXES (Pascal) : cover + photos produit gardent la MÊME taille quel que soit
            // le nb d'articles. Plus d'articles = plus de RANGÉES, pas des photos plus grandes.
            // La hauteur de la carte = le contenu (2 art. ≈ 1 rangée ; 4 art. ≈ 2 rangées).
            <div style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#12101c' }}>
              {/* COVER / DEVANTURE — hauteur FIXE : cover + avatar + nom boutique + badge BOUTIQUE */}
              <div style={{ position: 'relative', height: 190, backgroundImage: cover ? `url(${cover})` : undefined, backgroundColor: '#1c1830', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0) 55%)' }} />
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
                  {a.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                    : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{shopName}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={glassBadge}>BOUTIQUE</span>
                      {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                    </div>
                  </div>
                </div>
              </div>
              {/* PRODUITS : grille 2 col JOINTIVE, rangées de HAUTEUR FIXE (photos même taille), nom + prix en HAUT-GAUCHE */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '230px', gap: 0 }}>
                {products.map((p, i) => {
                  const pImg = p.images?.[0] || '';
                  const pPrice = fmtPrice(p.price);
                  return (
                    <button key={p.id || i} type="button" onClick={openShop}
                      style={{ position: 'relative', overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', backgroundImage: pImg ? `url(${pImg})` : undefined, backgroundColor: '#2a2340', backgroundSize: 'cover', backgroundPosition: 'center',
                        // Nb impair : le DERNIER produit prend toute la largeur (pas de blanc à côté).
                        gridColumn: (i === products.length - 1 && products.length % 2 === 1) ? '1 / -1' : undefined }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px 22px', background: 'linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 100%)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                        {pPrice && <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{pPrice}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* bouton « Voir la boutique » en VERRE POLI, à cheval en bas (prix en haut donc jamais masqué) */}
              <button type="button" onClick={openShop}
                style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 4, padding: '12px 24px', borderRadius: 14, border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontWeight: 800, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,.5)', boxShadow: '0 10px 26px rgba(0,0,0,.34)', cursor: 'pointer' }}>
                Voir la boutique →
              </button>
            </div>
          );
        })()
      ) : isLongPhoto ? (
        /* ── PHOTO en Long immersif (façon TikTok) : image PLEIN ÉCRAN (un post = un écran),
           TOUT posé dessus, ZÉRO blanc. Hauteur = 100svh (Pascal 2026-07-07 : « doit prendre toute la page »). ── */
        <div style={{ position: 'relative', width: '100%', height: '100svh', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.34) 26%, rgba(0,0,0,0) 54%)' }} />
          {/* Infos remontées au-dessus de la nav app du bas (~64px + safe-area). */}
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 80px)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))' }}>
            {/* auteur */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              {a.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{who}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={glassBadge}>{b.label}</span>
                  {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                </div>
              </div>
            </div>
            {/* légende SUR l'image */}
            {caption && <p style={{ margin: '10px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#fff', lineHeight: 1.45, textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>{caption}</p>}
            {/* page-entité vivante : article canonique derrière (posé sur média → dark) */}
            {renderEnrichment(true)}
            {/* actions SUR l'image (blanc) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : '#fff')}><Heart size={22} weight={liked ? 'fill' : 'regular'} /> {likes}</button>
              <button type="button" onClick={openComments} style={actionStyle('#fff')}><ChatCircle size={22} weight="regular" /> {it.comment_count ?? 0}</button>
              <button type="button" onClick={share} style={actionStyle('#fff')}><ShareNetwork size={22} weight="regular" /> Partager</button>
              <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : '#fff')}><BookmarkSimple size={22} weight={saved ? 'fill' : 'regular'} /></button>
              <span style={{ ...actionStyle('rgba(255,255,255,.9)'), marginLeft: 'auto', cursor: 'default' }}><Eye size={22} weight="regular" /> {views}</span>
            </div>
          </div>
        </div>
      ) : msgs ? (
        /* POST-CONVERSATION : le clip de Léa — texte + cards (youtube/lieux/recette)
           rendus par la MACHINE en CLAIR (Gemini option A). Plus de carte sombre. */
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m) => {
            const isLea = !!(m.ai_name && m.ai_name.trim());
            const txt = (m.content || '').trim();
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {txt && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: 'var(--t2m-ink)', margin: 0 }}>{isLea && <span style={{ fontWeight: 700, color: 'var(--t2m-accent)' }}>✦ {m.ai_name} · </span>}{txt}</p>}
                {m.youtube && <SuperCardView card={fromYouTube(m.youtube)} theme="light" variant="social" hideMeta />}
                {m.recipe && <SuperCardView card={fromRecipe(m.recipe)} theme="light" variant="social" hideMeta />}
                {m.places && m.places.length > 0 && m.places.map((p, i) => <SuperCardView key={i} card={fromPlace(p)} theme="light" variant="social" hideMeta />)}
              </div>
            );
          })}
        </div>
      ) : isPiece ? (
        <>
          {/* SALLE 3D en RoomCard : couverture + badge + bouton Entrer (→ stream /piece) */}
          {caption && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: 'var(--t2m-ink)', margin: '0 0 12px' }}>{caption}</p>}
          {/* page-entité vivante : article canonique derrière (thème clair) */}
          {renderEnrichment(false)}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: '#eef1f5' }}>
            {media
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              : <div style={{ width: '100%', height: '100%', background: 'radial-gradient(60% 60% at 50% 40%,#2a2340,#12101c)' }} />}
            <span style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(20,20,26,.6)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999 }}>🚪 Salle 3D</span>
          </div>
          <button type="button" onClick={enterRoom} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginBottom: 12, padding: '13px 0', borderRadius: 14, border: 'none', background: 'var(--t2m-primary)', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, boxShadow: '0 8px 20px rgba(255,127,17,.35)', cursor: 'pointer' }}>🚪 Entrer dans ma salle</button>
        </>
      ) : musicAudio ? (
        /* MUSIC CARD = disque (fix temporaire, en attendant le full .card) */
        <div style={{ marginBottom: 12 }}>
          <MusicDiscCard videoId={musicAudio.video_id} title={musicAudio.title} artist={musicAudio.artist} thumbnail={musicAudio.thumbnail} />
        </div>
      ) : (
        /* Card OS : le feed LIT le `.card` (readAlignedCard → parseCard), plus de fromPost. */
        <div style={{ marginBottom: 12 }}>
          {(() => {
            const card = alignedCard;
            return card
              ? <SuperCardView card={card} theme="light" variant={card.types?.includes('carousel') ? 'carousel' : card.items?.length ? 'boutique' : 'social'} hideMeta />
              : <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c0392b' }}>⚠️ .card illisible</p>;
          })()}
        </div>
      )}

      {/* actions RÉELLES : ❤️ · 💬 · ↗ partage · 🔖 Enregistrer · 👁 Vues.
          En Long immersif elles sont posées SUR l'image (branche photo) → on masque la rangée blanche ici. */}
      {!longImmersive && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 'auto' }}>
        <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : 'var(--t2m-ink-2)')}><Heart size={20} weight={liked ? 'fill' : 'duotone'} /> {likes}</button>
        <button type="button" onClick={openComments} style={actionStyle('var(--t2m-ink-2)')}><ChatCircle size={20} weight="duotone" /> {it.comment_count ?? 0}</button>
        <button type="button" onClick={share} style={actionStyle('var(--t2m-ink-2)')}><ShareNetwork size={20} weight="duotone" /> Partager</button>
        <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : 'var(--t2m-ink-2)')}><BookmarkSimple size={20} weight={saved ? 'fill' : 'duotone'} /></button>
        <span style={{ ...actionStyle('var(--t2m-ink-3)'), marginLeft: 'auto', cursor: 'default' }}><Eye size={20} weight="duotone" /> {views}</span>
      </div>
      )}
      {toast && <div style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(20,20,26,.85)', color: '#fff', fontSize: 12, padding: '5px 10px', borderRadius: 999, pointerEvents: 'none' }}>{toast}</div>}
    </motion.div>
  );
}
