'use client';

/**
 * Talk2Me #426 — SonPicker : zone "Son" du gabarit. Recherche dans la
 * bibliothèque music-hub → renvoie un UnifiedCard (fond musical). Le mix
 * (vidéo audible + fond ~30%) et l'extrait se règlent ensuite ; ici on choisit
 * juste le morceau. Doctrine [[content-grounding]] : que des sons réels.
 */

import { useState, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import type { UnifiedCard } from '@/lib/embed-hub/types';

interface ApiTrack {
  id: number;
  youtube_video_id: string;
  youtube_url?: string | null;
  title: string;
  artist_name: string | null;
  thumbnail_url?: string | null;
  duration_sec?: number | null;
  is_official?: boolean;
}

function thumbOf(t: ApiTrack): string {
  return t.thumbnail_url ?? `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`;
}

function trackToUnifiedCard(t: ApiTrack, volume: number): UnifiedCard {
  return {
    source: 'youtube',
    source_label: 'YouTube Music',
    type: 'audio',
    title: t.title,
    author: { name: t.artist_name ?? '' },
    thumbnail_url: thumbOf(t),
    description: t.artist_name ?? '',
    external_url: t.youtube_url || `https://www.youtube.com/watch?v=${t.youtube_video_id}`,
    embed: {
      kind: 'iframe',
      src: `https://www.youtube.com/embed/${t.youtube_video_id}?modestbranding=1&rel=0`,
      aspect_ratio: '16 / 9',
      allow_fullscreen: true,
    },
    meta: {
      youtube_video_id: t.youtube_video_id,
      duration_sec: t.duration_sec,
      is_official: t.is_official ?? false,
      music_hub_track_id: t.id,
      volume, // fond musical réglable (0-1). La vidéo reste audible (100%).
      video_volume: 1,
    },
  } as UnifiedCard;
}

interface Props {
  onPick: (music: UnifiedCard) => void;
  onClose: () => void;
}

export default function SonPicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Son choisi + volume du fond musical (défaut 30%, réglable jusqu'à 100%).
  const [selected, setSelected] = useState<ApiTrack | null>(null);
  const [volume, setVolume] = useState(30);

  const run = useCallback(async () => {
    const term = q.trim();
    if (term.length < 2) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/music/search?q=${encodeURIComponent(term)}&limit=30`, {
        cache: 'no-store',
      });
      const j = await r.json();
      const list: ApiTrack[] = Array.isArray(j?.tracks) ? j.tracks : [];
      setResults(list);
      if (!list.length) setErr('Aucun son trouvé.');
    } catch {
      setErr('Recherche indisponible.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#15151c] rounded-t-2xl border-t border-white/10 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/8">
          <span className="text-[14px] font-semibold text-white/95">Choisir un son (fond musical)</span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/75">
            <X className="w-4 h-4" />
          </button>
        </div>
        {selected ? (
          /* Réglage du volume du fond musical (défaut 30%, jusqu'à 100%) */
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-3 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbOf(selected)} alt="" className="w-16 h-16 rounded-xl object-cover bg-white/5" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] text-white/95 truncate">{selected.title}</div>
                <div className="text-[12px] text-white/55 truncate">{selected.artist_name ?? ''}</div>
              </div>
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[13px] text-white/80">Volume du fond musical</span>
              <span className="text-[14px] font-semibold text-red-200">{volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full accent-red-400"
            />
            <p className="text-[11px] text-white/40 mt-1">
              La vidéo garde son son (100%). Le fond musical passe par-dessus —
              30% par défaut, monte-le si tu veux l&apos;entendre plus.
            </p>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 font-medium"
              >
                ← Changer
              </button>
              <button
                type="button"
                onClick={() => onPick(trackToUnifiedCard(selected, volume / 100))}
                className="flex-1 py-2.5 rounded-xl bg-red-500/25 border border-red-400/50 text-red-100 font-semibold"
              >
                Valider le son
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && run()}
                    placeholder="Titre ou artiste…"
                    autoFocus
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-red-400/40"
                  />
                </div>
                <button type="button" onClick={run} disabled={loading} className="px-4 rounded-xl bg-red-500/20 border border-red-400/40 text-red-100 text-[13px] font-medium disabled:opacity-50">
                  {loading ? '…' : 'OK'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-5">
              {err && <p className="text-[12px] text-white/45 px-1">{err}</p>}
              <ul className="divide-y divide-white/5">
                {results.map((t) => (
                  <li key={`${t.id}-${t.youtube_video_id}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="w-full flex items-center gap-3 py-2 text-left active:opacity-80"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbOf(t)} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-white/5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] text-white/95 truncate">{t.title}</div>
                        <div className="text-[12px] text-white/55 truncate">{t.artist_name ?? ''}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
