'use client';

import React, { useRef, useEffect } from 'react';
import { Download, Music } from 'lucide-react';
import { audioChannel } from '@/lib/audio-channel';

interface MediaAudioCardProps {
  url: string;
  filename?: string;
  /** Stable id pour l'audioChannel (ex: messageId). */
  channelId: string;
}

/**
 * Talk2Me — Carte audio dans le chat (Pascal 2026-06-04).
 * Bloc compact : icône 🎵 + nom + lecteur HTML5 audio + download.
 * Intègre audioChannel pour exclusion mutuelle play.
 */
const MediaAudioCard: React.FC<MediaAudioCardProps> = ({
  url,
  filename,
  channelId,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
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

  const label = filename || 'Audio';

  return (
    <div
      data-testid="media-audio-card"
      className="w-full max-w-[320px] rounded-2xl bg-neutral-900/90 border border-white/5 p-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="shrink-0 w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center text-red-200">
          <Music size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/90 truncate">
            {label}
          </div>
          <div className="text-[10.5px] uppercase tracking-wider text-white/45">
            Audio
          </div>
        </div>
        <a
          href={url}
          download={filename || true}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          aria-label="Télécharger l'audio"
          data-testid="media-audio-download"
        >
          <Download size={14} />
        </a>
      </div>
      <audio
        ref={audioRef}
        src={url}
        controls
        preload="metadata"
        className="w-full"
      />
    </div>
  );
};

export default MediaAudioCard;
