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

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import CardActionsBar from '@/components/cards/CardActionsBar';
import { useLongPress } from '@/components/cards/CardLongPressMenu';
import { useOrientationUnlockOnFullscreen } from '@/lib/hooks/use-orientation-unlock-on-fullscreen';
// Talk2Me #422 — Disque vinyle rotatif si attached_audio_json présent
import MusicVinylOverlay from '@/components/cards/MusicVinylOverlay';
import type { UnifiedCard } from '@/lib/embed-hub/types';

interface CardAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface Props {
  card: {
    id: string;
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
  };
  cardKind?: 'direct_card';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
  /** Mode TikTok plein viewport (cf. #352). */
  fullScreen?: boolean;
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

export default function VideoCardDisplay({
  card,
  cardKind = 'direct_card',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: Props) {
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

  // Container classes diffèrent entre fullScreen (remplit la section parent)
  // et fallback aspect 9/16 (legacy).
  const containerClass = fullScreen
    ? 'relative w-full h-full bg-black overflow-hidden border-0 select-none'
    : 'relative w-full bg-black rounded-2xl overflow-hidden border border-white/8 select-none';
  const containerStyle = fullScreen ? undefined : { aspectRatio: '9 / 16' as const };

  return (
    <motion.div
      ref={containerRef}
      {...lp.bind}
      initial={{ opacity: 0, y: fullScreen ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: fullScreen ? 0.25 : 0.35 }}
      className={containerClass}
      style={containerStyle}
      data-testid={`video-card-${card.id}`}
    >
      {card.media_url && (
        <video
          ref={videoRef}
          src={card.media_url}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer"
          loop
          muted={muted}
          playsInline
          preload="auto"
          onClick={toggleMute}
        />
      )}

      {/* Talk2Me #422 — Disque vinyle rotatif si musique attachée */}
      {(() => {
        if (!card.attached_audio_json) return null;
        let music: UnifiedCard | null = null;
        try {
          music = JSON.parse(card.attached_audio_json) as UnifiedCard;
        } catch {
          return null;
        }
        if (!music || !music.title) return null;
        return <MusicVinylOverlay music={music} isVideoPlaying={isInView} />;
      })()}

      {/* Header user + time (overlay top) — Talk2Me #378 dynamique sur card.author */}
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

      {/* Hint "Tap pour activer le son" — visible que si muted + showSoundHint */}
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
        {/* Lot A — CardActionsBar (variant overlay pour fond noir) */}
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
