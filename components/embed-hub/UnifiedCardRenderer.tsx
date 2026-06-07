'use client';

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import FallbackCard from './FallbackCard';
import { audioChannel } from '@/lib/audio-channel';
import { useOrientationUnlockOnFullscreen } from '@/lib/hooks/use-orientation-unlock-on-fullscreen';

/**
 * Universal Embed Hub — renderer générique pour toute UnifiedCard.
 *
 * Phase 4 (Pascal 2026-06-05) :
 *  - prop `variant` : 'inline-chat' (compact conv) | 'fullscreen-feed' (immersif /home)
 *  - audioChannel : exclusion mutuelle audio/vidéo (#337)
 *  - useOrientationUnlockOnFullscreen : paysage uniquement en fullscreen vidéo
 *  - type='article' : bouton "Lire" → ArticleReader modal (#366)
 *
 * Doctrine `feedback_talktome_no_excuses` : si l'embed casse, FallbackCard
 * (jamais d'erreur brute affichée).
 */

const ArticleReader = dynamic(() => import('@/components/embeds/ArticleReader'), {
  ssr: false,
});

interface Props {
  card: UnifiedCard;
  variant?: 'inline-chat' | 'fullscreen-feed';
}

export default function UnifiedCardRenderer({ card, variant = 'inline-chat' }: Props) {
  const [embedError, setEmbedError] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const uid = useId();
  const participantId = `card-${uid}-${card.source}`;

  // #337 : déverrouille la rotation device si la vidéo passe en fullscreen.
  useOrientationUnlockOnFullscreen();

  const needsAudioChannel =
    card.type === 'video' || card.type === 'audio';
  const isYouTube = card.source === 'youtube' && card.embed?.kind === 'iframe';

  /**
   * Pause locale : pour YouTube (jsapi) on poste un message, sinon on
   * remount l'iframe via reloadKey (Spotify-style → coupe la lecture).
   */
  const pauseSelf = () => {
    if (isYouTube && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          '*'
        );
        return;
      } catch {
        /* fallthrough → remount */
      }
    }
    setReloadKey((k) => k + 1);
  };

  // YouTube : handshake jsapi pour recevoir onStateChange.
  useEffect(() => {
    if (!isYouTube) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    const onLoad = () => {
      try {
        win.postMessage(
          JSON.stringify({ event: 'listening', id: participantId }),
          '*'
        );
      } catch {
        /* ignore */
      }
    };
    onLoad();
    const el = iframeRef.current;
    el?.addEventListener('load', onLoad);

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
      let state: number | undefined;
      if (obj.event === 'infoDelivery' && typeof obj.info === 'object' && obj.info) {
        state = (obj.info as { playerState?: number }).playerState;
      } else if (obj.event === 'onStateChange') {
        state = typeof obj.info === 'number' ? obj.info : undefined;
      }
      if (state === 1) {
        audioChannel.request({ id: participantId, pause: pauseSelf });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      el?.removeEventListener('load', onLoad);
      audioChannel.release(participantId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, isYouTube]);

  // Non-YouTube audio/video : best-effort sur interaction utilisateur.
  useEffect(() => {
    if (isYouTube || !needsAudioChannel) return;
    return () => {
      audioChannel.release(participantId);
    };
  }, [participantId, isYouTube, needsAudioChannel]);

  const handleInteract = () => {
    if (!needsAudioChannel || isYouTube) return;
    audioChannel.request({ id: participantId, pause: pauseSelf });
  };

  // Pas d'embed ou embed cassé → FallbackCard
  if (!card.embed || embedError || card.source === 'fallback') {
    return <FallbackCard card={card} />;
  }

  const isFullscreen = variant === 'fullscreen-feed';

  const containerCls = isFullscreen
    ? 'relative w-full h-full overflow-hidden bg-black flex flex-col'
    : 'rounded-2xl overflow-hidden w-full max-w-full mx-auto bg-black';

  // Article : ouvre ArticleReader sur clic "Lire" (#366).
  const handleArticleRead = () => setReaderOpen(true);

  return (
    <>
      <div className={containerCls} onPointerDown={handleInteract}>
        {/* Header source + author */}
        <div
          className={
            isFullscreen
              ? 'absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-black/70 to-transparent'
              : 'flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/5'
          }
        >
          <span className="text-[10px] uppercase tracking-wider font-medium text-red-400">
            {card.source_label}
          </span>
          {card.author && (
            <span className="text-[11px] text-white/70 truncate">· {card.author.name}</span>
          )}
        </div>

        {/* Embed iframe */}
        {card.embed.kind === 'iframe' && card.embed.aspect_ratio && (
          <div
            className={isFullscreen ? 'flex-1 relative w-full' : 'relative w-full'}
            style={isFullscreen ? undefined : { aspectRatio: card.embed.aspect_ratio }}
          >
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={card.embed.src}
              allow={card.embed.allow}
              allowFullScreen={card.embed.allow_fullscreen}
              className="absolute inset-0 w-full h-full border-0"
              title={card.title}
              onError={() => setEmbedError(true)}
            />
          </div>
        )}
        {card.embed.kind === 'iframe' && !card.embed.aspect_ratio && card.embed.height && (
          // Bug #10 audit #413 : variant fullscreen-feed + sources audio
          // (Spotify track 152px, Deezer 92px, SoundCloud 166px, Apple
          // Music 175px) → ne PAS stretcher à height 100% (widget cassé).
          // On centre verticalement + max-width pour respiration.
          (() => {
            const isAudio = card.type === 'audio';
            if (isFullscreen && isAudio) {
              return (
                <div className="flex-1 flex items-center justify-center px-4">
                  <iframe
                    key={reloadKey}
                    ref={iframeRef}
                    src={card.embed.src}
                    allow={card.embed.allow}
                    allowFullScreen={card.embed.allow_fullscreen}
                    className="w-full max-w-xl border-0 block bg-white rounded-xl"
                    style={{ height: card.embed.height, maxHeight: '90%' }}
                    title={card.title}
                    onError={() => setEmbedError(true)}
                  />
                </div>
              );
            }
            return (
              <iframe
                key={reloadKey}
                ref={iframeRef}
                src={card.embed.src}
                allow={card.embed.allow}
                allowFullScreen={card.embed.allow_fullscreen}
                className="w-full border-0 block bg-white"
                style={{ height: isFullscreen ? '100%' : card.embed.height }}
                title={card.title}
                onError={() => setEmbedError(true)}
              />
            );
          })()
        )}
        {/* Image directe (bug #5 audit #413). image_url affiché tel quel. */}
        {card.embed.kind === 'image' && card.embed.image_url && (
          <div
            className={
              isFullscreen
                ? 'flex-1 flex items-center justify-center bg-black'
                : 'relative w-full bg-black'
            }
            style={isFullscreen ? undefined : { aspectRatio: '16 / 9' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.embed.image_url}
              alt={card.embed.alt || card.title}
              className={
                isFullscreen
                  ? 'max-w-full max-h-full object-contain'
                  : 'absolute inset-0 w-full h-full object-contain'
              }
              onError={() => setEmbedError(true)}
            />
          </div>
        )}
        {card.embed.kind === 'custom' && typeof card.meta?.oembed_srcdoc === 'string' && (
          <iframe
            key={reloadKey}
            srcDoc={card.meta.oembed_srcdoc as string}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="w-full border-0 block bg-black"
            style={{
              minHeight: isFullscreen ? '100%' : 300,
              aspectRatio: card.embed.aspect_ratio || '1 / 1',
            }}
            title={card.title}
            onError={() => setEmbedError(true)}
          />
        )}

        {/* Title + description + actions */}
        <div
          className={
            isFullscreen
              ? 'absolute bottom-0 left-0 right-0 z-10 px-3 pt-8 pb-3 bg-gradient-to-t from-black/80 to-transparent space-y-2'
              : 'px-3 py-3 space-y-1'
          }
        >
          <h3 className="text-[14px] font-semibold text-white/95 leading-snug line-clamp-2">
            {card.title}
          </h3>
          {card.description && !isFullscreen && (
            <p className="text-[12px] text-white/65 line-clamp-2">{card.description}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Article → bouton "Lire" qui ouvre ArticleReader (#366) */}
            {card.type === 'article' && (
              <button
                type="button"
                onClick={handleArticleRead}
                className="text-[12px] px-3 py-1.5 rounded-full bg-red-500/15 text-red-300 hover:bg-red-500/25"
              >
                Lire
              </button>
            )}
            {card.actions.map((action, i) => {
              if (action.kind === 'open' || action.kind === 'book') {
                return (
                  <a
                    key={i}
                    href={action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] px-3 py-1.5 rounded-full bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  >
                    {action.label} ↗
                  </a>
                );
              }
              if (action.kind === 'directions') {
                const href = `https://www.google.com/maps/dir/?api=1&destination=${action.lat},${action.lng}`;
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
                  >
                    {action.label} ↗
                  </a>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  className="text-[12px] px-3 py-1.5 rounded-full bg-white/[0.06] text-white/80 hover:bg-white/[0.10]"
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ArticleReader modal (#366) — uniquement pour type=article */}
      {card.type === 'article' && (
        <ArticleReader
          url={card.external_url}
          open={readerOpen}
          onClose={() => setReaderOpen(false)}
        />
      )}
    </>
  );
}
