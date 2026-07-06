'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-07) — MusicDiscCard.
 *
 * Rendu "disque vinyle" d'un son que Léa propose dans le chat (résultat de
 * search_music = bibliothèque music-hub de l'user). Tap sur le disque = play /
 * pause : le disque TOURNE et l'audio YouTube se lance (embed caché, gesture
 * user → autoplay OK mobile). Pas de pastille, sobre.
 */

import { useState } from 'react';
import { Play, Pause } from '@/lib/icons';

interface Props {
  videoId: string;
  title: string;
  artist?: string;
  thumbnail?: string | null;
}

export default function MusicDiscCard({ videoId, title, artist, thumbnail }: Props) {
  const [playing, setPlaying] = useState(false);
  const cover = thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const marquee = `♪  ${artist ? artist + ' — ' : ''}${title}`;

  return (
    <div className="music-disc-card flex items-center gap-3 p-3 rounded-2xl bg-[#15151c] border border-white/10 max-w-[330px]">
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="vinyl-disc shrink-0"
        style={{ ['--vinyl-play-state' as any]: playing ? 'running' : 'paused' }}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        <span className="vinyl-inner">
          <span className="vinyl-grooves" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="vinyl-cover" draggable={false} />
        </span>
        <span className="vinyl-play">
          {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-white/95 truncate">{title}</div>
        <div className="text-[12px] text-white/55 truncate">{artist || ''}</div>
        <div className="vinyl-marquee mt-1">
          <span className="vinyl-marquee-text" style={{ ['--vinyl-play-state' as any]: playing ? 'running' : 'paused' }}>
            {marquee} &nbsp;&nbsp;&nbsp;&nbsp; {marquee}
          </span>
        </div>
      </div>

      {/* Audio YouTube caché (le disque EST le contrôle visuel) */}
      {playing && (
        <iframe
          title={title}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
        />
      )}

      <style jsx>{`
        .music-disc-card {
          position: relative;
        }
        .vinyl-disc {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000 65%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
          border: none;
          padding: 0;
          cursor: pointer;
          animation: disc-spin 4s linear infinite;
          animation-play-state: var(--vinyl-play-state, paused);
        }
        .vinyl-inner {
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
          background: repeating-radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0.05) 0 1px,
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
        }
        .vinyl-play {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .vinyl-disc:hover .vinyl-play,
        .vinyl-disc:active .vinyl-play {
          opacity: 1;
        }
        .vinyl-marquee {
          width: 100%;
          overflow: hidden;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.55);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 8%, black 90%, transparent 100%);
          mask-image: linear-gradient(to right, transparent 0%, black 8%, black 90%, transparent 100%);
        }
        .vinyl-marquee-text {
          display: inline-block;
          white-space: nowrap;
          animation: disc-marquee 12s linear infinite;
          animation-play-state: var(--vinyl-play-state, paused);
        }
        @keyframes disc-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes disc-marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
