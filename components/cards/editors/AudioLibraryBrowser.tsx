'use client';

/**
 * AudioLibraryBrowser — grille des sons libres de droits par catégorie.
 *
 * Talk2Me #420 — partie LIB de l'onglet Musique.
 *
 * Doctrine [[talktome-design-premium]] : dark sobre, accents subtils.
 *
 * Architecture :
 *  - Tabs catégories (Chill / Energetic / Dramatic / Lo-fi / Ambient)
 *  - Lazy-load par catégorie via /api/audio-lib?category=xxx
 *  - Bouton ▶ par track (preview audio inline, un seul à la fois)
 *  - Click ligne = sélection track active
 *  - Mémorise le dernier player audio pour ne pas en jouer deux en même temps
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Check, Loader2 } from '@/lib/icons';

const CATEGORIES = [
  { id: 'chill',     label: 'Chill' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'dramatic',  label: 'Dramatic' },
  { id: 'lofi',      label: 'Lo-fi' },
  { id: 'ambient',   label: 'Ambient' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface LibTrack {
  id: string;
  name: string;
  category: string;
  duration_sec: number;
  file: string;
  source: string;
  license: string;
  bpm?: number;
  mood?: string;
}

interface Props {
  /** Track actuellement sélectionnée (par son id). null = aucune. */
  selectedId: string | null;
  onSelect: (track: LibTrack) => void;
}

function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioLibraryBrowser({ selectedId, onSelect }: Props) {
  const [category, setCategory] = useState<CategoryId>('chill');
  const [tracks, setTracks] = useState<LibTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cache local par catégorie pour éviter refetch
  const cacheRef = useRef<Partial<Record<CategoryId, LibTrack[]>>>({});

  useEffect(() => {
    let cancelled = false;
    const cached = cacheRef.current[category];
    if (cached) {
      setTracks(cached);
      return;
    }
    setLoading(true);
    fetch(`/api/audio-lib?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: LibTrack[] = Array.isArray(json?.tracks) ? json.tracks : [];
        cacheRef.current[category] = list;
        setTracks(list);
      })
      .catch(() => {
        if (cancelled) return;
        setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  // Stoppe le player quand le composant unmount ou catégorie change
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = '';
      }
    };
  }, []);

  useEffect(() => {
    // Quand on change de catégorie : pause le preview courant
    const a = audioRef.current;
    if (a) {
      a.pause();
    }
    setPreviewingId(null);
  }, [category]);

  const togglePreview = (track: LibTrack) => {
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
      a.addEventListener('ended', () => setPreviewingId(null));
    }
    if (previewingId === track.id) {
      a.pause();
      setPreviewingId(null);
      return;
    }
    a.src = track.file;
    a.currentTime = 0;
    a.volume = 0.7;
    a.play().catch(() => {
      // ignore autoplay blocked etc.
    });
    setPreviewingId(track.id);
  };

  return (
    <div className="space-y-3" data-testid="audio-library-browser">
      {/* Onglets catégories */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={
              'px-3 py-1 rounded-full text-[12px] transition-colors ' +
              (category === c.id
                ? 'bg-red-500/25 border border-red-300/40 text-red-100'
                : 'bg-white/[0.04] border border-white/8 text-white/65 hover:text-white')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grille tracks */}
      <div
        className="rounded-2xl bg-white/[0.02] border border-white/8 max-h-[280px] overflow-y-auto"
        data-testid="audio-tracks-list"
      >
        {loading && (
          <div className="flex items-center justify-center py-8 text-white/50 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Chargement…
          </div>
        )}
        {!loading && tracks.length === 0 && (
          <div className="py-8 text-center text-white/40 text-sm">
            Aucune track dans cette catégorie.
          </div>
        )}
        {!loading &&
          tracks.map((t) => {
            const isPreviewing = previewingId === t.id;
            const isSelected = selectedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t)}
                className={
                  'w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-white/5 hover:bg-white/[0.04] transition-colors last:border-b-0 ' +
                  (isSelected ? 'bg-red-500/10' : '')
                }
                data-testid={`audio-track-${t.id}`}
              >
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(t);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePreview(t);
                    }
                  }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white/[0.08] border border-white/12 text-white flex items-center justify-center hover:bg-white/[0.14]"
                  aria-label={isPreviewing ? 'Pause' : 'Écouter'}
                >
                  {isPreviewing ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-white/90 text-[13px]">
                    {t.name}
                  </span>
                  <span className="block truncate text-white/40 text-[10.5px]">
                    {formatDuration(t.duration_sec)}
                    {t.bpm && t.bpm > 0 ? ` · ${t.bpm} bpm` : ''}
                    {t.mood ? ` · ${t.mood}` : ''}
                  </span>
                </span>
                {isSelected && (
                  <Check className="w-4 h-4 text-red-300 flex-shrink-0" />
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
