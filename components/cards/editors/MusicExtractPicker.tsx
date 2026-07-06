'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-06) — Sélecteur d'extrait musical.
 *
 * Quand une music card (YouTube, passthrough) est attachée à une VideoCard,
 * permet de choisir QUEL passage du morceau accompagne la vidéo (le drop, le
 * refrain…), façon "ajuster le son" TikTok. La fenêtre = durée de la vidéo ;
 * on fait glisser le départ sur la durée du morceau.
 *
 * Stocke `start_sec` dans music.meta.start_sec. La lecture synchro (vidéo
 * muette + YouTube à start_sec) est gérée au rendu de la card.
 */

import { useRef, useState } from 'react';
import { Play, Pause } from '@/lib/icons';
import type { UnifiedCard } from '@/lib/embed-hub/types';

interface Props {
  music: UnifiedCard;
  videoDurationS: number;
  startSec: number;
  onChange: (startSec: number) => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MusicExtractPicker({ music, videoDurationS, startSec, onChange }: Props) {
  const songDur =
    (music.meta && typeof (music.meta as any).duration_sec === 'number'
      ? (music.meta as any).duration_sec
      : 0) || 0;
  const videoId =
    (music.meta && (music.meta as any).youtube_video_id) ||
    (music.meta && (music.meta as any).video_id) ||
    '';
  const [preview, setPreview] = useState(false);

  // Fenêtre = durée vidéo (bornée à la durée du morceau).
  const win = Math.min(videoDurationS || 0, songDur || videoDurationS || 0);
  const maxStart = Math.max(0, songDur - win);

  if (!songDur || !videoId) {
    // Durée du morceau inconnue → on ne peut pas placer la fenêtre.
    return (
      <div className="mt-2 text-[11px] text-white/40">
        Extrait : le morceau démarrera au début (durée non disponible).
      </div>
    );
  }

  const pct = maxStart > 0 ? (startSec / maxStart) * 100 : 0;
  const winPct = songDur > 0 ? (win / songDur) * 100 : 100;

  return (
    <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/8 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-white/70">🎚️ Extrait du son</span>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="text-[11px] text-red-200 bg-red-500/15 border border-red-400/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-red-500/25"
        >
          {preview ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
          {preview ? 'Stop' : 'Écouter'}
        </button>
      </div>

      {/* Barre morceau + fenêtre sélectionnée */}
      <div className="relative h-9 rounded-lg bg-black/40 overflow-hidden border border-white/8">
        {/* fenêtre extrait */}
        <div
          className="absolute top-0 bottom-0 bg-red-500/30 border-x-2 border-red-400/70"
          style={{ left: `${(startSec / songDur) * 100}%`, width: `${winPct}%` }}
        />
        {/* faux waveform déco */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-1 pointer-events-none opacity-40">
          {Array.from({ length: 60 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 bg-white/30 rounded-full"
              style={{ height: `${20 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Slider départ */}
      <input
        type="range"
        min={0}
        max={Math.max(0, Math.floor(maxStart))}
        step={1}
        value={Math.min(startSec, maxStart)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full mt-2 accent-red-400"
        aria-label="Point de départ de l'extrait"
      />
      <div className="flex items-center justify-between text-[11px] text-white/55 mt-1">
        <span>Départ {fmt(startSec)}</span>
        <span>Extrait {fmt(startSec)} → {fmt(Math.min(startSec + win, songDur))}</span>
        <span>Morceau {fmt(songDur)}</span>
      </div>

      {/* Aperçu YouTube de l'extrait (démarre à start_sec) */}
      {preview && (
        <div className="mt-2 relative w-full rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&start=${Math.floor(startSec)}&modestbranding=1&rel=0&playsinline=1`}
            title="Extrait"
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      )}
    </div>
  );
}
