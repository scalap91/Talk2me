'use client';

/**
 * VideoTimeline — timeline de l'éditeur VideoCard.
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - outils manuels EN PARALLÈLE de l'IA
 *  - poignées draggables start/end (rouge/vert) pour le trim
 *  - scrubber qui suit currentTime
 *
 * Coords : 0–1 normalisées sur la timeline → le composant convertit en s.
 */

import React, { useCallback, useRef } from 'react';

interface Props {
  duration: number;
  currentTime: number;
  /** Trim courant en s (null = pas de trim → poignées aux extrémités). */
  trim: { start_s: number; end_s: number } | null;
  /** Cover time s (frame extraite). */
  coverTime: number | null;
  /** Appelé quand l'user scrub manuellement (clique/drag dans la zone libre). */
  onSeek: (timeS: number) => void;
  /** Appelé pendant drag d'une poignée (live update visuel). */
  onTrimChange: (start_s: number, end_s: number) => void;
  /** Appelé au pointer-up de la poignée (commit, push undo). */
  onTrimCommit: (start_s: number, end_s: number) => void;
  /** Petit marker visuel "cover" (drag direct possible aussi). */
  onCoverChange?: (time_s: number) => void;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return '00:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VideoTimeline({
  duration,
  currentTime,
  trim,
  coverTime,
  onSeek,
  onTrimChange,
  onTrimCommit,
  onCoverChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | 'cover' | 'scrub' | null>(null);
  const lastTrimRef = useRef<{ start_s: number; end_s: number } | null>(trim);
  lastTrimRef.current = trim;

  const startS = trim?.start_s ?? 0;
  const endS = trim?.end_s ?? duration;
  const trimDur = Math.max(0, endS - startS);

  const pctOf = useCallback(
    (t: number) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0),
    [duration]
  );

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r || r.width === 0 || duration <= 0) return 0;
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return pct * duration;
    },
    [duration]
  );

  const onTrackPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.handle) {
      const which = target.dataset.handle as 'start' | 'end' | 'cover';
      draggingRef.current = which;
      target.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    // Click libre dans le track → seek
    draggingRef.current = 'scrub';
    const t = timeFromClientX(e.clientX);
    onSeek(t);
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const t = timeFromClientX(e.clientX);
    if (draggingRef.current === 'scrub') {
      onSeek(t);
      return;
    }
    if (draggingRef.current === 'cover') {
      onCoverChange?.(t);
      return;
    }
    // Trim drag : on update visuel (pas de snapshot undo à chaque pixel).
    const cur = lastTrimRef.current ?? { start_s: 0, end_s: duration };
    if (draggingRef.current === 'start') {
      const ns = Math.max(0, Math.min(t, cur.end_s - 0.2));
      onTrimChange(ns, cur.end_s);
    } else if (draggingRef.current === 'end') {
      const ne = Math.max(cur.start_s + 0.2, Math.min(t, duration));
      onTrimChange(cur.start_s, ne);
    }
  };

  const onTrackPointerUp = () => {
    const which = draggingRef.current;
    draggingRef.current = null;
    if (which === 'start' || which === 'end') {
      const cur = lastTrimRef.current;
      if (cur) onTrimCommit(cur.start_s, cur.end_s);
    }
  };

  const trimPctStart = pctOf(startS);
  const trimPctEnd = pctOf(endS);
  const scrubPct = pctOf(currentTime);
  const coverPct = typeof coverTime === 'number' ? pctOf(coverTime) : null;

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between text-[11px] text-white/55 mb-1">
        <span>{fmt(startS)}</span>
        <span className="text-white/85">
          {trimDur > 0 ? `${fmt(startS)} – ${fmt(endS)} · ${trimDur.toFixed(1)}s` : '—'}
        </span>
        <span>{fmt(duration)}</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={onTrackPointerUp}
        onPointerLeave={(e) => {
          // si on relâche dehors, on commit quand même
          if (draggingRef.current) onTrackPointerUp();
        }}
        className="relative h-10 rounded-xl bg-white/[0.05] border border-white/10 touch-none cursor-pointer"
        role="slider"
        aria-label="Timeline vidéo"
        aria-valuenow={Math.round(scrubPct)}
      >
        {/* Zone sélectionnée (trim) */}
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-red-500/35 to-red-700/35 border-y border-white/15"
          style={{
            left: `${trimPctStart}%`,
            width: `${Math.max(0, trimPctEnd - trimPctStart)}%`,
          }}
          aria-hidden
        />

        {/* Cover marker */}
        {coverPct !== null && (
          <div
            data-handle="cover"
            className="absolute top-0 bottom-0 w-1.5 -ml-0.5 bg-yellow-400/90 rounded-full cursor-ew-resize"
            style={{ left: `${coverPct}%` }}
            aria-label="Couverture"
            title={`Cover @${coverTime?.toFixed(1)}s`}
          />
        )}

        {/* Scrubber (currentTime) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] -ml-px bg-white/95 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.5)]"
          style={{ left: `${scrubPct}%` }}
          aria-hidden
        />

        {/* Poignée start (rouge) */}
        <div
          data-handle="start"
          className="absolute top-1/2 -translate-y-1/2 w-4 h-10 -ml-2 rounded-md bg-red-500 border border-red-300 shadow-[0_2px_6px_rgba(0,0,0,0.4)] cursor-ew-resize flex items-center justify-center"
          style={{ left: `${trimPctStart}%` }}
          aria-label="Début"
          title={`Début @${startS.toFixed(1)}s`}
        >
          <div className="w-[2px] h-4 bg-white/80 rounded pointer-events-none" />
        </div>

        {/* Poignée end (vert) */}
        <div
          data-handle="end"
          className="absolute top-1/2 -translate-y-1/2 w-4 h-10 -ml-2 rounded-md bg-emerald-500 border border-emerald-300 shadow-[0_2px_6px_rgba(0,0,0,0.4)] cursor-ew-resize flex items-center justify-center"
          style={{ left: `${trimPctEnd}%` }}
          aria-label="Fin"
          title={`Fin @${endS.toFixed(1)}s`}
        >
          <div className="w-[2px] h-4 bg-white/80 rounded pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
