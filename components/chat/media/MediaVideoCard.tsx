'use client';

import React, { useRef, useEffect } from 'react';
import { Download } from '@/lib/icons';
import { audioChannel } from '@/lib/audio-channel';
import { useOrientationUnlockOnFullscreen } from '@/lib/hooks/use-orientation-unlock-on-fullscreen';

interface MediaVideoCardProps {
  url: string;
  filename?: string;
  poster?: string;
  /** Stable id pour l'audioChannel (ex: messageId). */
  channelId: string;
}

/**
 * Talk2Me — Carte vidéo dans le chat (Pascal 2026-06-04).
 * "le lecteur sactive comme pour youtube mais je peux telecharger la video".
 *
 * Lecteur HTML5 natif (controls). Pas d'autoplay : click-to-play.
 * Intègre audioChannel : démarrer la lecture pause tout autre média actif.
 * IntersectionObserver : pause quand la vidéo sort du viewport.
 */
const MediaVideoCard: React.FC<MediaVideoCardProps> = ({
  url,
  filename,
  poster,
  channelId,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Pascal 2026-06-04 : rotation paysage autorisée en fullscreen vidéo
  // (le lecteur HTML5 propose un bouton fullscreen natif).
  useOrientationUnlockOnFullscreen();

  // Audio channel : exclusion mutuelle
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => {
      audioChannel.request({
        id: channelId,
        pause: () => {
          try {
            el.pause();
          } catch {
            /* noop */
          }
        },
      });
    };
    const onPause = () => audioChannel.release(channelId);
    const onEnded = () => audioChannel.release(channelId);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      audioChannel.release(channelId);
    };
  }, [channelId]);

  // IntersectionObserver : pause hors viewport
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && !el.paused) {
            try {
              el.pause();
            } catch {
              /* noop */
            }
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      data-testid="media-video-card"
      className="relative w-full max-w-[360px] rounded-2xl overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        className="w-full max-h-[480px] bg-black"
      />
      <a
        href={url}
        download={filename || true}
        className="absolute top-2 right-2 flex items-center justify-center w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur text-white transition-colors z-10"
        aria-label="Télécharger la vidéo"
        data-testid="media-video-download"
      >
        <Download size={16} />
      </a>
    </div>
  );
};

export default MediaVideoCard;
