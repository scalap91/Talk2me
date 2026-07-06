'use client';

/**
 * Talk2Me — MusicVinylOverlay (Pascal #422, 2026-06-06).
 *
 * Disque vinyle rotatif affiché en bas-gauche d'une VideoCard quand de la
 * musique est attachée. PUR CSS keyframes (rotation jamais via JS rAF, cf
 * doctrine "ça tourne et revient interdit").
 *
 * Animation : spin 4s linéaire infini.
 * animation-play-state: running quand isVideoPlaying, paused sinon.
 *
 * Texte scroll "♪ Artist - Title" sous le disque, marquee 12s linear infini.
 *
 * onTap → bottom-sheet UnifiedCardRenderer de la musique (preview).
 */

import React, { useState } from 'react';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import { X } from '@/lib/icons';

interface Props {
  music: UnifiedCard;
  isVideoPlaying: boolean;
}

export default function MusicVinylOverlay({ music, isVideoPlaying }: Props) {
  const [open, setOpen] = useState(false);

  const artist = music.author?.name ?? '';
  const title = music.title ?? '';
  const marqueeText = `♪  ${artist}${artist && title ? ' — ' : ''}${title}`;
  const ytId = (music.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const cover =
    music.thumbnail_url ??
    (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');

  return (
    <>
      <div
        className="music-vinyl-overlay absolute bottom-3 left-3 z-30 pointer-events-none flex flex-col items-start gap-1.5"
        aria-label="Musique attachée"
      >
        {/* Disque (pointer-events auto) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="vinyl-disc pointer-events-auto"
          style={{
            // play-state via CSS variable côté wrapper
            ['--vinyl-play-state' as any]: isVideoPlaying ? 'running' : 'paused',
          }}
          aria-label={`Musique : ${artist} - ${title}`}
        >
          <span className="vinyl-disc-inner">
            <span className="vinyl-grooves" />
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="vinyl-cover"
                draggable={false}
              />
            )}
          </span>
        </button>

        {/* Marquee texte */}
        <div className="vinyl-marquee pointer-events-none">
          <span
            className="vinyl-marquee-text"
            style={{
              ['--vinyl-play-state' as any]: isVideoPlaying ? 'running' : 'paused',
            }}
          >
            {marqueeText} &nbsp;&nbsp;&nbsp;&nbsp; {marqueeText}
          </span>
        </div>
      </div>

      {/* Preview YouTube INLINE sur le post-card (Pascal 2026-06-07) : tap sur
          le disque → mini-lecteur posé SUR la card, pas une bottom-sheet. */}
      {open && ytId && (
        <div
          className="absolute inset-x-3 top-16 z-40 rounded-xl overflow-hidden bg-black border border-white/15 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0&playsinline=1`}
              title={title || 'Musique'}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center"
              aria-label="Fermer le preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-2 py-1 text-[11px] text-white/85 truncate bg-black/85">{marqueeText}</div>
        </div>
      )}

      <style jsx>{`
        .vinyl-disc {
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000 65%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 4px 18px rgba(0, 0, 0, 0.55),
            0 0 0 1px rgba(255, 255, 255, 0.08) inset;
          padding: 0;
          border: none;
          cursor: pointer;
          animation: vinyl-spin 4s linear infinite;
          animation-play-state: var(--vinyl-play-state, paused);
        }
        @media (min-width: 640px) {
          .vinyl-disc {
            width: 72px;
            height: 72px;
          }
        }
        .vinyl-disc-inner {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .vinyl-grooves {
          position: absolute;
          inset: 4px;
          border-radius: 9999px;
          background:
            repeating-radial-gradient(
              circle at center,
              rgba(255, 255, 255, 0.04) 0 1px,
              transparent 1px 4px
            );
        }
        .vinyl-cover {
          position: relative;
          width: 50%;
          height: 50%;
          border-radius: 9999px;
          object-fit: cover;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12);
          pointer-events: none;
        }
        .vinyl-marquee {
          width: 120px;
          max-width: 60vw;
          overflow: hidden;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.78);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 12%,
            black 88%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 12%,
            black 88%,
            transparent 100%
          );
        }
        .vinyl-marquee-text {
          display: inline-block;
          white-space: nowrap;
          animation: vinyl-marquee 12s linear infinite;
          animation-play-state: var(--vinyl-play-state, paused);
        }
        @keyframes vinyl-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes vinyl-marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </>
  );
}
