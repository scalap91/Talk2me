'use client';

/**
 * /home/ubuntu/talktome/components/cards/editors/VideoFiltersTab.tsx
 *
 * Talk2Me #421 — onglet "Filtres" : grille des presets avec preview CSS
 * appliquée à un thumbnail (1re frame du clip sélectionné).
 *
 * Comportement :
 *  - Si un clip est sélectionné → applique le filtre à CE clip uniquement
 *    (`onApplyToSelected`).
 *  - Sinon → applique à tous les clips (`onApplyToAll`).
 *  - La preview LIVE dans le player principal utilise `clip.filter` (CSS).
 *  - Le burn-in ffmpeg se fait au baking via FILTER_PRESETS[].ffmpeg.
 */

import React, { useEffect, useState } from 'react';
import { FILTER_ORDER, FILTER_PRESETS, type FilterPreset } from '@/lib/video-filters';
import type { VideoClip } from '@/lib/card-draft-store';

interface Props {
  clips: VideoClip[];
  selectedClipId: string | null;
  onApplyToSelected: (clipId: string, filter: FilterPreset) => void;
  onApplyToAll: (filter: FilterPreset) => void;
}

export default function VideoFiltersTab({
  clips,
  selectedClipId,
  onApplyToSelected,
  onApplyToAll,
}: Props) {
  const previewClip =
    clips.find((c) => c.id === selectedClipId) || clips[0] || null;
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);

  // Génère 1 mini thumb de previewClip
  useEffect(() => {
    let cancelled = false;
    if (!previewClip) {
      setThumb(null);
      return;
    }
    setThumbLoading(true);
    (async () => {
      try {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = previewClip.source_url;
        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => reject(new Error('timeout')), 8000);
          v.onloadedmetadata = () => {
            v.currentTime = Math.min(
              previewClip.trim_start_sec + 0.1,
              Math.max(0, (v.duration || 0) - 0.05)
            );
          };
          v.onseeked = () => {
            clearTimeout(to);
            resolve();
          };
          v.onerror = () => {
            clearTimeout(to);
            reject(new Error('vid err'));
          };
        });
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 240;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) throw new Error('no dims');
        const ar = vw / vh;
        const tar = 160 / 240;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (ar > tar) {
          sw = vh * tar;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / tar;
          sy = (vh - sh) / 2;
        }
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, 160, 240);
        if (cancelled) return;
        setThumb(c.toDataURL('image/jpeg', 0.7));
      } catch {
        if (!cancelled) setThumb(null);
      } finally {
        if (!cancelled) setThumbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewClip?.id, previewClip?.source_url, previewClip?.trim_start_sec]);

  const currentFilter: FilterPreset =
    (previewClip?.filter as FilterPreset) || 'none';

  const apply = (key: FilterPreset) => {
    if (selectedClipId) {
      onApplyToSelected(selectedClipId, key);
    } else {
      onApplyToAll(key);
    }
  };

  return (
    <div className="space-y-2" data-testid="filters-tab">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-white/40">
          Filtres couleur
        </div>
        <div className="text-[10.5px] text-white/40">
          {selectedClipId
            ? `Applique au clip sélectionné`
            : 'Applique à tous les clips'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2" data-testid="filters-grid">
        {FILTER_ORDER.map((key) => {
          const f = FILTER_PRESETS[key];
          const active = key === currentFilter;
          return (
            <button
              type="button"
              key={key}
              onClick={() => apply(key)}
              className={
                'relative rounded-xl overflow-hidden border transition-all ' +
                (active
                  ? 'border-red-400 shadow-[0_0_0_2px_rgba(248,113,113,0.3)]'
                  : 'border-white/12 hover:border-white/25')
              }
              data-testid={`filter-${key}`}
              aria-pressed={active}
              title={f.label}
            >
              <div className="aspect-[2/3] w-full bg-white/[0.04] flex items-center justify-center overflow-hidden">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ filter: f.css }}
                    draggable={false}
                  />
                ) : thumbLoading ? (
                  <span className="text-[10px] text-white/30">…</span>
                ) : (
                  <span
                    className="w-full h-full"
                    style={{
                      background: 'linear-gradient(135deg, #4338ca 0%, #ec4899 100%)',
                      filter: f.css,
                    }}
                  />
                )}
              </div>
              <div className="px-1.5 py-1 text-[10.5px] text-white/85 flex items-center justify-between bg-black/40">
                <span className="truncate">{f.label}</span>
                <span aria-hidden>{f.emoji}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
