'use client';

/**
 * /home/ubuntu/talktome/components/cards/editors/VideoClipsTimeline.tsx
 *
 * Talk2Me #421 — timeline horizontale multi-clips (TikTok/CapCut style).
 *
 * Features :
 *  - Mini-thumbs par clip (poster vidéo cached à la 1re frame post-trim)
 *  - Durée affichée sous chaque clip
 *  - Tap = sélectionne pour édition (trim/filter)
 *  - Drag manuel via pointer events pour réordonner
 *  - Bouton "+" en fin → callback onRequestAdd()
 *  - Indicateur de transition entre 2 clips (icône)
 *  - Bouton supprimer (X) sur clip sélectionné
 *
 * Mobile-first : scroll horizontal natif, touch-action ok.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Scissors, ArrowRightLeft } from 'lucide-react';
import type { VideoClip, Transition } from '@/lib/card-draft-store';
import { filterCss } from '@/lib/video-filters';

interface Props {
  clips: VideoClip[];
  transitions: Transition[];
  /** id du clip sélectionné (édition focalisée). null = aucun. */
  selectedId: string | null;
  onSelect: (clipId: string) => void;
  onRequestAdd: () => void;
  onRemove: (clipId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  /** Click sur l'icône transition entre clip[i] et clip[i+1]. */
  onTransitionClick?: (index: number) => void;
}

function fmtDur(s: number): string {
  if (!isFinite(s) || s <= 0) return '0.0s';
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${Math.round(s)}s`;
}

export default function VideoClipsTimeline({
  clips,
  transitions,
  selectedId,
  onSelect,
  onRequestAdd,
  onRemove,
  onReorder,
  onTransitionClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  /* Gen poster thumbs (1 frame post-trim) via <video> + canvas. */
  useEffect(() => {
    let cancelled = false;
    const gen = async (clip: VideoClip): Promise<string | null> => {
      try {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = clip.source_url;
        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => reject(new Error('timeout')), 8000);
          v.onloadedmetadata = () => {
            v.currentTime = Math.min(
              clip.trim_start_sec + 0.05,
              Math.max(0, (v.duration || 0) - 0.05)
            );
          };
          v.onseeked = () => {
            clearTimeout(to);
            resolve();
          };
          v.onerror = () => {
            clearTimeout(to);
            reject(new Error('video error'));
          };
        });
        const canvas = document.createElement('canvas');
        const W = 96;
        const H = 144;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        // object-cover style
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) return null;
        const ar = vw / vh;
        const targetAr = W / H;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (ar > targetAr) {
          sw = vh * targetAr;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / targetAr;
          sy = (vh - sh) / 2;
        }
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
        return canvas.toDataURL('image/jpeg', 0.65);
      } catch {
        return null;
      }
    };

    (async () => {
      for (const c of clips) {
        if (thumbs[c.id]) continue;
        // génère si pas déjà
        const data = await gen(c);
        if (cancelled) return;
        if (data) {
          setThumbs((t) => ({ ...t, [c.id]: data }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.map((c) => c.id + ':' + c.source_url + ':' + c.trim_start_sec).join('|')]);

  /* ----- Drag & drop reorder (pointer events) ----- */

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (clips.length < 2) return;
    setDragIndex(index);
    setHoverIndex(index);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const children = Array.from(wrap.querySelectorAll<HTMLElement>('[data-clip-cell]'));
    const x = e.clientX;
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        setHoverIndex(i);
        return;
      }
    }
  };

  const endDrag = () => {
    if (dragIndex === null || hoverIndex === null || dragIndex === hoverIndex) {
      setDragIndex(null);
      setHoverIndex(null);
      return;
    }
    const ids = clips.map((c) => c.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(hoverIndex, 0, moved);
    onReorder(ids);
    setDragIndex(null);
    setHoverIndex(null);
  };

  const totalDuration = useMemo(
    () =>
      clips.reduce(
        (s, c) => s + Math.max(0, c.trim_end_sec - c.trim_start_sec),
        0
      ),
    [clips]
  );

  return (
    <div className="w-full" data-testid="video-clips-timeline">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[11px] uppercase tracking-wide text-white/40">
          Clips ({clips.length}){' '}
          {clips.length > 0 && (
            <span className="text-white/30">· total {fmtDur(totalDuration)}</span>
          )}
        </span>
        {clips.length > 1 && (
          <span className="text-[10px] text-white/35">
            Glisse pour réordonner
          </span>
        )}
      </div>

      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className="flex items-stretch gap-1 overflow-x-auto pb-1.5 -mx-1 px-1 touch-pan-x"
        style={{ scrollSnapType: 'x proximity' }}
      >
        {clips.map((clip, i) => {
          const dur = Math.max(0, clip.trim_end_sec - clip.trim_start_sec);
          const isSelected = clip.id === selectedId;
          const isDragging = dragIndex === i;
          const isDropTarget = hoverIndex === i && dragIndex !== null && dragIndex !== i;
          const filterStyle = clip.filter ? { filter: filterCss(clip.filter) } : {};
          return (
            <React.Fragment key={clip.id}>
              {/* Transition badge (entre clip i-1 et i) */}
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => onTransitionClick?.(i - 1)}
                  className="flex flex-col items-center justify-center self-center w-6 h-12 text-white/45 hover:text-white/80"
                  aria-label={`Transition ${i}`}
                  title={
                    transitions[i - 1]?.type === 'fade'
                      ? `Fondu ${transitions[i - 1].duration_ms} ms`
                      : 'Coupe directe'
                  }
                  data-testid={`transition-${i - 1}`}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  <span className="text-[8.5px] mt-0.5 leading-none">
                    {transitions[i - 1]?.type === 'fade' ? 'fade' : 'cut'}
                  </span>
                </button>
              )}
              <div
                data-clip-cell
                data-testid={`clip-cell-${i}`}
                data-clip-id={clip.id}
                className={
                  'relative flex-shrink-0 rounded-xl border transition-all ' +
                  (isSelected
                    ? 'border-red-400/80 shadow-[0_0_0_2px_rgba(248,113,113,0.25)]'
                    : 'border-white/12') +
                  (isDragging ? ' opacity-50 scale-95' : '') +
                  (isDropTarget ? ' ring-2 ring-emerald-400/60' : '')
                }
                style={{ width: '64px', scrollSnapAlign: 'start' }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(clip.id)}
                  onPointerDown={startDrag(i)}
                  className="block w-full h-24 rounded-xl overflow-hidden bg-black/70 relative"
                  aria-label={`Clip ${i + 1}, durée ${dur.toFixed(1)} secondes`}
                >
                  {thumbs[clip.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbs[clip.id]}
                      alt=""
                      className="w-full h-full object-cover"
                      style={filterStyle}
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/25 text-[10px]">
                      …
                    </div>
                  )}
                  <span className="absolute bottom-0.5 right-1 text-[9.5px] text-white bg-black/60 px-1 rounded font-mono">
                    {fmtDur(dur)}
                  </span>
                  <span className="absolute top-0.5 left-1 text-[9px] text-white/85 bg-black/55 px-1 rounded">
                    {i + 1}
                  </span>
                </button>
                {isSelected && clips.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(clip.id);
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                    aria-label={`Supprimer clip ${i + 1}`}
                    title="Supprimer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {clip.filter && clip.filter !== 'none' && (
                  <span className="absolute top-0.5 right-1 text-[8.5px] text-white bg-violet-500/80 px-1 rounded">
                    fx
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Add button */}
        <button
          type="button"
          onClick={onRequestAdd}
          className="flex-shrink-0 w-16 h-24 rounded-xl border-2 border-dashed border-white/25 bg-white/[0.03] text-white/55 hover:text-white hover:border-white/45 flex flex-col items-center justify-center gap-1"
          aria-label="Ajouter un clip"
          data-testid="add-clip-button"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px]">Ajouter</span>
        </button>
      </div>

      {selectedId && clips.length > 0 && (
        <div className="text-[10.5px] text-white/45 mt-1 px-0.5 flex items-center gap-1.5">
          <Scissors className="w-2.5 h-2.5" />
          Tap un clip pour le sélectionner. Réglages (trim/filtre) ci-dessous
          s&apos;appliquent au clip choisi.
        </div>
      )}
    </div>
  );
}
