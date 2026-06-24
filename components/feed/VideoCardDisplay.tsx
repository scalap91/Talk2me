'use client';

/**
 * Talk2Me #336 (Pascal 2026-06-04) — VideoCard avec audio auto pattern TikTok.
 * Talk2Me #352 (Pascal 2026-06-04) — Mode `fullScreen` : la card remplit
 *   100% du viewport (snap TikTok-style sur /home). En dehors de /home,
 *   fallback à l'ancien rendu aspect 9/16.
 *
 * - État global `videoUnmuted: boolean` persisté dans sessionStorage
 *   (clé `talktome:videoUnmuted`).
 * - Au mount + à chaque entrée dans le viewport :
 *     * si videoUnmuted === true → essai play() unmuted
 *     * fallback : play() muted (autoplay policy Chrome/Safari)
 * - Tap sur la vidéo → toggle mute. Si on unmute, on persiste sessionStorage
 *   et toutes les vidéos suivantes démarreront unmuted.
 * - IntersectionObserver : play uniquement si >50% visible, pause sinon.
 * - Indicateur visuel : icône Volume2/VolumeX + hint "Tap pour activer le son"
 *   si muted.
 */

import { memo, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { PostTitle, PostMeta } from '@/components/posts/PostText';
import { parseCaption } from '@/lib/posts/parse-caption';
import { Volume2, VolumeX, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import CardActionsBar from '@/components/cards/CardActionsBar';
import PostChrome from '@/components/feed/PostChrome';
import { useLongPress } from '@/components/cards/CardLongPressMenu';
import { useOrientationUnlockOnFullscreen } from '@/lib/hooks/use-orientation-unlock-on-fullscreen';
import { useCardCreationStore } from '@/lib/card-creation-store';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

interface CardAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface Props {
  card: {
    id: string;
    user_id?: string;
    media_url: string | null;
    caption: string | null;
    likes: number;
    views: number;
    createdAt?: number;
    created_at?: number;
    comment_count?: number;
    /** Talk2Me #378 — auteur public pour le header card. */
    author?: CardAuthorView | null;
    /** Talk2Me #422 — musique attachée (UnifiedCard sérialisée). */
    attached_audio_json?: string | null;
    /** Talk2Me #425 — produit attaché (ProductCardData sérialisé) → aperçu + Shop. */
    attached_product_json?: string | null;
  };
  cardKind?: 'direct_card';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
  /** Mode TikTok plein viewport (cf. #352). */
  fullScreen?: boolean;
  /** Talk2Me #425 — rendu dans le sous-onglet Shop : pas d'attribution affiliée
   *  (clic ne rémunère personne) + bouton "Créer ma card" (re-attache). */
  fromShop?: boolean;
}

const SS_KEY = 'talktome:videoUnmuted';

function readVideoUnmuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeVideoUnmuted(v: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SS_KEY, v ? '1' : '0');
  } catch {
    // ignore (private mode, etc.)
  }
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return 'maintenant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)}j`;
  return Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(ts)
  );
}

// Talk2Me #378 — display_name → username → "Anonyme".
function authorLabel(a: CardAuthorView | null | undefined): string {
  if (!a) return 'Anonyme';
  if (a.display_name && a.display_name.trim().length > 0) return a.display_name.trim();
  if (a.username && a.username.trim().length > 0) return a.username.trim();
  return 'Anonyme';
}

function authorInitial(a: CardAuthorView | null | undefined): string {
  const label = authorLabel(a);
  return label.charAt(0).toUpperCase() || '?';
}

// Parseur unique : voir lib/posts/parse-caption.ts (importé en tête). Plus de duplication.

function safeJsonParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function VideoCardDisplay({
  card,
  cardKind = 'direct_card',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
  fromShop = false,
}: Props) {
  const openWithProduct = useCardCreationStore((s) => s.openWithProduct);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lp = useLongPress(() => onLongPress?.());

  // Pascal 2026-06-04 : rotation paysage autorisée en fullscreen vidéo.
  useOrientationUnlockOnFullscreen();
  // muted par défaut côté SSR pour autoriser l'autoplay. Au mount on tente
  // l'unmute si sessionStorage le permet.
  const [muted, setMuted] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const [showSoundHint, setShowSoundHint] = useState(false);
  const ts = card.createdAt ?? card.created_at ?? Date.now();

  // Découpage de la légende
  const parsed = useMemo(() => parseCaption(card.caption), [card.caption]);
  const { title, description, hashtags, tags } = parsed;

  // Musique attachée
  const music: UnifiedCard | null = useMemo(() => {
    if (!card.attached_audio_json) return null;
    try {
      return JSON.parse(card.attached_audio_json) as UnifiedCard;
    } catch {
      return null;
    }
  }, [card.attached_audio_json]);

  const sonVideoId = (music?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const sonCover = music?.thumbnail_url || (sonVideoId ? `https://i.ytimg.com/vi/${sonVideoId}/hqdefault.jpg` : null);

  // Produit attaché
  const product: ProductCardData | null = useMemo(() => {
    if (!card.attached_product_json) return null;
    try {
      return JSON.parse(card.attached_product_json) as ProductCardData;
    } catch {
      return null;
    }
  }, [card.attached_product_json]);

  const hasSon = music && music.title;
  const hasProduct = !!product;

  /** Joue la vidéo en respectant la préférence sessionStorage.
   *  Si unmuted demandé mais bloqué par autoplay policy → fallback muted. */
  const tryPlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const wantUnmuted = readVideoUnmuted();
    if (wantUnmuted) {
      v.muted = false;
      setMuted(false);
      try {
        await v.play();
      } catch {
        // Chrome/Safari autoplay policy : on retombe muted.
        v.muted = true;
        setMuted(true);
        setShowSoundHint(true);
        try {
          await v.play();
        } catch {
          // ignore
        }
      }
    } else {
      v.muted = true;
      setMuted(true);
      setShowSoundHint(true);
      try {
        await v.play();
      } catch {
        // ignore
      }
    }
  }, []);

  /** Pause la vidéo (sort du viewport). */
  const pauseVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
    } catch {
      // ignore
    }
  }, []);

  // IntersectionObserver : play si >50% visible, pause sinon.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio > 0.5;
          setIsInView(visible);
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Lance/arrête la vidéo quand isInView change.
  useEffect(() => {
    if (isInView) {
      void tryPlay();
    } else {
      pauseVideo();
    }
  }, [isInView, tryPlay, pauseVideo]);

  // Hint son visible 2.5s puis fade-out, uniquement si muted.
  useEffect(() => {
    if (!muted) {
      setShowSoundHint(false);
      return;
    }
    if (!showSoundHint) return;
    const t = setTimeout(() => setShowSoundHint(false), 2500);
    return () => clearTimeout(t);
  }, [muted, showSoundHint]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    writeVideoUnmuted(!next);
    if (!next) {
      // Unmute demandé par tap user → on tente play (geste user, autorisé).
      void v.play().catch(() => {
        /* ignore */
      });
      setShowSoundHint(false);
    } else {
      setShowSoundHint(true);
    }
  }, [muted]);

  // Attribution produit : sous-id = owner du post, UNIQUEMENT hors Shop.
  const ownerId = fromShop ? null : card.user_id || card.author?.id || null;
  const supplierUrl = (() => {
    if (!product?.source_url) return product?.source_url;
    if (!ownerId) return product.source_url; // depuis le Shop → personne n'est crédité
    try {
      const u = new URL(product.source_url);
      u.searchParams.set('t2m_ref', ownerId);
      return u.toString();
    } catch {
      return product.source_url;
    }
  })();

  // Mode fullScreen : layout overlay identique au gabarit ImageCardDisplay
  if (fullScreen) {
    return (
      <motion.div
        ref={containerRef}
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full bg-black overflow-hidden select-none"
        data-testid={`video-card-${card.id}`}
      >
        {/* MÉDIA plein cadre */}
        {card.media_url && (
          <video
            ref={videoRef}
            src={card.media_url}
            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            className="absolute inset-0 w-full h-full object-cover bg-black"
            loop
            muted={muted}
            playsInline
            preload="auto"
            onClick={toggleMute}
          />
        )}

        {/* OVERLAY HAUT */}
        <div className="absolute top-0 inset-x-0 z-10 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+6rem)] bg-gradient-to-b from-black/70 to-transparent">
          {/* TITRE — modèle générique partagé */}
          <PostTitle title={title} />

          {/* Bouton mute coin haut-droit */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            data-testid="video-mute-toggle"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+5rem)] w-9 h-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center text-white/90 hover:text-white border border-white/10"
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Hint "Tap pour activer le son" centré */}
        {muted && showSoundHint && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label="Activer le son"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[12px] text-white/95 font-medium animate-pulse"
          >
            <VolumeX className="w-3.5 h-3.5" />
            Tap pour activer le son
          </button>
        )}

        {/* OVERLAY BAS */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pb-4 space-y-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
          {/* DESCRIPTION + HASHTAGS + TAGS — modèle générique partagé */}
          <PostMeta description={description} hashtags={hashtags} tags={tags} />

          {/* RANGÉE SON + PRODUIT — affichée seulement si au moins un des deux existe */}
          {(hasSon || hasProduct) && (
            <div className="flex gap-2.5">
              {/* SON — affiché seulement si audio et audio.title existent */}
              {hasSon && (
                <div className="shrink-0 bg-black/45 backdrop-blur rounded-2xl border border-white/15 px-2.5 py-2 flex items-center gap-2">
                  <span className="relative w-10 h-10 rounded-full bg-black/40 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
                    {music && sonCover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sonCover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-5 h-5 text-white/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white/85">Son</div>
                    <div className="text-[10px] text-white/60 leading-tight line-clamp-1">
                      {music!.title}
                    </div>
                  </div>
                </div>
              )}

              {/* PRODUIT — seulement si présent */}
              {hasProduct && (
                <a
                  href={supplierUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className={`bg-black/45 backdrop-blur rounded-2xl border border-red-400/30 px-2 py-2 flex items-center gap-2.5 active:scale-[0.98] transition ${hasSon ? 'flex-1' : 'w-full'}`}
                >
                  <span className="relative w-[56px] aspect-[3/4] rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                    {product!.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product!.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-5 h-5 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 01-8 0" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-red-100">Produit</div>
                    <div className="text-[11px] text-white/90 line-clamp-2 mt-0.5">{product!.title}</div>
                    {product!.price_label && (
                      <div className="text-[11px] text-red-200/90 font-semibold mt-0.5">{product!.price_label}</div>
                    )}
                    {fromShop ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openWithProduct(product!);
                        }}
                        className="mt-1 rounded-full bg-red-500/25 border border-red-400/50 text-red-100 text-[11px] font-semibold py-1 px-2.5 active:scale-95 transition"
                      >
                        + Créer ma card
                      </button>
                    ) : (
                      <div className="text-[10px] text-red-300/70 mt-0.5">Voir sur {product!.source} ›</div>
                    )}
                  </div>
                </a>
              )}
            </div>
          )}

          {/* Chrome commun : bulle auteur + barre d'actions (source unique PostChrome) */}
          <PostChrome author={card.author} cardKind={cardKind} cardId={card.id} likes={card.likes} views={card.views} commentCount={card.comment_count ?? 0} initialLikedByMe={initialLikedByMe} isOwner={isOwner} />
        </div>
      </motion.div>
    );
  }

  // Fallback (non-fullScreen) : rendu legacy aspect 9/16
  return (
    <motion.div
      ref={containerRef}
      {...lp.bind}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative w-full bg-black rounded-2xl overflow-hidden border border-white/8 select-none"
      style={{ aspectRatio: '9 / 16' }}
      data-testid={`video-card-${card.id}`}
    >
      {card.media_url && (
        <video
          ref={videoRef}
          src={card.media_url}
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          className="absolute inset-0 w-full h-full object-cover cursor-pointer bg-black"
          loop
          muted={muted}
          playsInline
          preload="auto"
          onClick={toggleMute}
        />
      )}

      {/* Header user + time (overlay top) */}
      <div className="absolute top-0 inset-x-0 p-3 flex items-center gap-2 bg-gradient-to-b from-black/55 to-transparent z-10">
        {card.author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.author.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-xs font-bold">
            {authorInitial(card.author)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/95">{authorLabel(card.author)}</p>
          <p className="text-[10px] text-white/60">{formatRelativeTime(ts)}</p>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          data-testid="video-mute-toggle"
          className="w-9 h-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center text-white/90 hover:text-white border border-white/10"
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Hint "Tap pour activer le son" */}
      {muted && showSoundHint && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label="Activer le son"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[12px] text-white/95 font-medium animate-pulse"
        >
          <VolumeX className="w-3.5 h-3.5" />
          Tap pour activer le son
        </button>
      )}

      {/* Caption + engagement (overlay bottom) */}
      <div className="absolute bottom-0 inset-x-0 p-3 pb-5 bg-gradient-to-t from-black/75 via-black/35 to-transparent space-y-2 z-10">
        {card.caption && (
          <p className="text-sm text-white/95 leading-snug line-clamp-3">
            {card.caption}
          </p>
        )}
        <CardActionsBar
          cardKind={cardKind}
          cardId={card.id}
          initialLikes={card.likes}
          initialViews={card.views}
          initialCommentCount={card.comment_count ?? 0}
          initialLikedByMe={initialLikedByMe}
          isOwner={isOwner}
          variant="overlay"
        />
      </div>
    </motion.div>
  );
}

export default memo(VideoCardDisplay);
