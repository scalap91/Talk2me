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
import UnifiedCardRenderer from '@/components/embed-hub/UnifiedCardRenderer';
import { X } from 'lucide-react';

interface Props {
  music: UnifiedCard;
  isVideoPlaying: boolean;
}

export default function MusicVinylOverlay({ music, isVideoPlaying }: Props) {
  const [open, setOpen] = useState(false);

  const artist = music.author?.name ?? '';
  const title = music.title ?? '';
  const marqueeText = `♪  ${artist}${artist && title ? ' — ' : ''}${title}`;
  const cover =
    music.thumbnail_url ??
    (music.meta && (music.meta as any).youtube_video_id
      ? `https://i.ytimg.com/vi/${(music.meta as any).youtube_video_id}/hqdefault.jpg`
      : '');

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
            setOpen(true);
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

      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[480px] bg-neutral-950 border-t border-white/10 rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] text-white/80">Musique attachée</div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/60 p-1"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <UnifiedCardRenderer card={music} variant="inline-chat" />
          </div>
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
