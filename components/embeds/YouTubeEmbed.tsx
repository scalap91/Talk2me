'use client';

import { useEffect, useRef, useId } from 'react';
import { audioChannel } from '@/lib/audio-channel';
import { useOrientationUnlockOnFullscreen } from '@/lib/hooks/use-orientation-unlock-on-fullscreen';

interface YouTubeRichData {
  title: string;
  channel: string;
  description?: string;
}

interface YouTubeEmbedProps {
  videoId: string;
  originalUrl?: string;
  /** Si fourni : rendu "card riche" avec titre + chaîne + description. */
  rich?: YouTubeRichData;
}

/**
 * Talk2Me #337 (Pascal 2026-06-04) — Audio exclusif.
 *
 * L'iframe YouTube est chargée avec `enablejsapi=1` ce qui permet de la
 * contrôler via `postMessage`. Quand l'utilisateur lance la lecture d'une
 * autre vidéo, on coupe la précédente automatiquement (audioChannel).
 *
 * Détection du play : on écoute les events postMessage de l'iframe
 * (infoDelivery / onStateChange). State 1 = PLAYING.
 */
export default function YouTubeEmbed({ videoId, originalUrl, rich }: YouTubeEmbedProps) {
  const watchUrl = originalUrl ?? `https://www.youtube.com/watch?v=${videoId}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const uid = useId();
  const participantId = `youtube-${uid}-${videoId}`;

  // Pascal 2026-06-04 : déverrouille la rotation device quand la vidéo
  // YouTube entre en fullscreen, re-locke portrait à la sortie.
  useOrientationUnlockOnFullscreen();

  const pauseIframe = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      );
    } catch {
      // silencieux
    }
  };

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    // Handshake : demander à l'iframe d'envoyer ses events au parent.
    const onLoad = () => {
      try {
        win.postMessage(
          JSON.stringify({ event: 'listening', id: participantId }),
          '*'
        );
      } catch {
        // ignore
      }
    };
    // L'iframe peut déjà être chargée à ce stade (cache) → tente direct.
    onLoad();
    const iframeEl = iframeRef.current;
    iframeEl?.addEventListener('load', onLoad);

    const onMessage = (e: MessageEvent) => {
      if (e.source !== win) return;
      let data: unknown = e.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;
      const obj = data as { event?: string; info?: { playerState?: number } | number };
      // YouTube envoie { event: 'infoDelivery', info: { playerState: 1 } } au play
      // ou { event: 'onStateChange', info: 1 } selon les versions.
      let state: number | undefined;
      if (obj.event === 'infoDelivery' && typeof obj.info === 'object' && obj.info) {
        state = (obj.info as { playerState?: number }).playerState;
      } else if (obj.event === 'onStateChange') {
        state = typeof obj.info === 'number' ? obj.info : undefined;
      }
      if (state === 1) {
        // PLAYING → demande le canal audio
        audioChannel.request({ id: participantId, pause: pauseIframe });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      iframeEl?.removeEventListener('load', onLoad);
      audioChannel.release(participantId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId]);

  // URL avec jsapi activé + origin pour sécurité postMessage
  const embedSrc =
    typeof window !== 'undefined'
      ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
      : `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;

  if (rich) {
    return (
      <div className="rounded-2xl overflow-hidden w-full max-w-full mx-auto bg-white/[0.04]">
        <div className="relative w-full pb-[56.25%] bg-black">
          <iframe
            ref={iframeRef}
            src={embedSrc}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            loading="lazy"
            allow="accelerated-2d-canvas; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="p-3.5 space-y-2">
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-red-400/80 font-medium bg-red-500/10 px-2 py-0.5 rounded-full">
            <span aria-hidden>▶</span>
            <span>YouTube</span>
          </div>
          {rich.title && (
            <h3 className="text-[14px] font-semibold text-white leading-snug line-clamp-2">
              {rich.title}
            </h3>
          )}
          {rich.channel && (
            <div className="text-[12px] text-white/55">{rich.channel}</div>
          )}
          {rich.description && rich.description.trim() !== '' && (
            <p className="text-[12px] text-white/50 leading-relaxed line-clamp-3">
              {rich.description}
            </p>
          )}
          <div className="pt-1 flex items-center justify-end">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-white/45 hover:text-white/70 transition-colors"
            >
              Ouvrir sur YouTube ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Fallback : URL collée par user, iframe seul
  return (
    <div className="rounded-2xl overflow-hidden w-full max-w-full mx-auto bg-black">
      <div className="relative w-full pb-[56.25%]">
        <iframe
          ref={iframeRef}
          src={embedSrc}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          loading="lazy"
          allow="accelerated-2d-canvas; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="flex items-center justify-end px-3 py-2 gap-2 text-[10px] text-white/40">
        <a href={watchUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir
        </a>
      </div>
    </div>
  );
}
