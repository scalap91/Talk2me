'use client';

/**
 * Talk2Me — MusicPickerSheet (Pascal #422, 2026-06-06).
 *
 * Bottom-sheet ouvert depuis l'éditeur VideoCard via bouton "🎵 Ajouter musique".
 * 4 onglets : 🔥 Tendance / 🎵 Artistes (A-Z) / 🔍 Recherche / 🔗 URL.
 *
 * Mobile-first, dark mode cohérent T2M.
 * Tap track → onSelect(unifiedCard) → ferme sheet.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Music, Flame, Link2, Loader2 } from '@/lib/icons';
import type { UnifiedCard } from '@/lib/embed-hub/types';

interface ApiTrack {
  id: number;
  youtube_video_id: string;
  youtube_url: string;
  title: string;
  artist_name: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  view_count: number;
  is_official: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (card: UnifiedCard) => void;
}

type Tab = 'trending' | 'artists' | 'search' | 'url';

const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function trackToUnifiedCard(t: ApiTrack): UnifiedCard {
  return {
    source: 'youtube',
    source_label: 'YouTube Music',
    type: 'audio',
    title: t.title,
    author: { name: t.artist_name },
    thumbnail_url:
      t.thumbnail_url ??
      `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`,
    description: t.artist_name,
    external_url: t.youtube_url,
    embed: {
      kind: 'iframe',
      src: `https://www.youtube.com/embed/${t.youtube_video_id}?modestbranding=1&rel=0`,
      aspect_ratio: '16 / 9',
      allow_fullscreen: true,
    },
    meta: {
      youtube_video_id: t.youtube_video_id,
      duration_sec: t.duration_sec,
      is_official: t.is_official,
      music_hub_track_id: t.id,
    },
    actions: [
      { kind: 'open', label: 'Voir sur YouTube', url: t.youtube_url },
    ],
  };
}

export default function MusicPickerSheet({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('trending');
  const [trending, setTrending] = useState<ApiTrack[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ApiTrack[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string>('A');
  const [letterTracks, setLetterTracks] = useState<ApiTrack[]>([]);
  const [letterLoading, setLetterLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Trending au mount
  useEffect(() => {
    if (!open) return;
    if (tab !== 'trending' || trending.length > 0) return;
    setTrendingLoading(true);
    fetch('/api/music/trending?limit=30')
      .then((r) => r.json())
      .then((j) => setTrending(j.tracks ?? []))
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoading(false));
  }, [open, tab, trending.length]);

  // Recherche debounce
  useEffect(() => {
    if (tab !== 'search') return;
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/music/search?q=${encodeURIComponent(q)}&limit=30`)
        .then((r) => r.json())
        .then((j) => setSearchResults(j.tracks ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [tab, searchQ]);

  // Alphabet : top track par lettre
  useEffect(() => {
    if (tab !== 'artists' || !open) return;
    setLetterLoading(true);
    fetch(`/api/music/alphabet?letter=${encodeURIComponent(activeLetter)}&limit=30`)
      .then((r) => r.json())
      .then((j) => setLetterTracks(j.tracks ?? []))
      .catch(() => setLetterTracks([]))
      .finally(() => setLetterLoading(false));
  }, [tab, activeLetter, open]);

  // URL → résoudre via embed-hub
  const handleUrlAdd = async () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const res = await fetch('/api/embed-hub?url=' + encodeURIComponent(u));
      const j = await res.json();
      if (!res.ok || !j.card) {
        setUrlError('URL non reconnue (essaie YouTube/Spotify/Deezer/Apple Music)');
        return;
      }
      onSelect(j.card as UnifiedCard);
      onClose();
    } catch {
      setUrlError('Impossible de résoudre cette URL pour le moment');
    } finally {
      setUrlLoading(false);
    }
  };

  const handleSelect = (t: ApiTrack) => {
    onSelect(trackToUnifiedCard(t));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-[480px] h-[85vh] bg-[var(--t2m-paper)] border-t border-[var(--t2m-line)] rounded-t-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--t2m-line)]">
          <div className="flex items-center gap-2 text-[var(--t2m-ink)]">
            <Music className="w-4 h-4 text-red-400" />
            <span className="text-[14px] font-medium">Ajouter une musique</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)] p-1"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]">
          <TabBtn active={tab === 'trending'} onClick={() => setTab('trending')} icon={<Flame className="w-3.5 h-3.5" />} label="Tendance" />
          <TabBtn active={tab === 'artists'} onClick={() => setTab('artists')} icon={<Music className="w-3.5 h-3.5" />} label="A-Z" />
          <TabBtn active={tab === 'search'} onClick={() => setTab('search')} icon={<Search className="w-3.5 h-3.5" />} label="Rechercher" />
          <TabBtn active={tab === 'url'} onClick={() => setTab('url')} icon={<Link2 className="w-3.5 h-3.5" />} label="URL" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'trending' && (
            <TrackList tracks={trending} loading={trendingLoading} onSelect={handleSelect} emptyMsg="Aucun titre tendance pour l'instant." />
          )}

          {tab === 'artists' && (
            <div className="flex flex-col h-full">
              <div className="sticky top-0 z-10 bg-[var(--t2m-paper)]/95 backdrop-blur border-b border-[var(--t2m-line)] px-2 py-2 flex gap-1 overflow-x-auto">
                {LETTERS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLetter(l)}
                    className={
                      'flex-shrink-0 w-7 h-7 text-[11px] rounded-full transition ' +
                      (activeLetter === l
                        ? 'bg-red-500/15 text-red-500 border border-red-400/40'
                        : 'text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)]')
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
              <TrackList tracks={letterTracks} loading={letterLoading} onSelect={handleSelect} emptyMsg={`Aucun artiste indexé sous "${activeLetter}". Reviens plus tard (crawler 24/7).`} />
            </div>
          )}

          {tab === 'search' && (
            <div className="flex flex-col h-full">
              <div className="sticky top-0 z-10 bg-[var(--t2m-paper)]/95 backdrop-blur border-b border-[var(--t2m-line)] px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--t2m-ink-3)]" />
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Titre, artiste…"
                    autoFocus
                    className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-2xl pl-8 pr-3 py-2 text-[13px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]"
                  />
                </div>
              </div>
              <TrackList tracks={searchResults} loading={searchLoading} onSelect={handleSelect} emptyMsg={searchQ ? 'Aucun résultat. Le crawler va ajouter cet artiste sous peu.' : 'Tape un nom de titre ou d’artiste.'} />
            </div>
          )}

          {tab === 'url' && (
            <div className="p-4 space-y-3">
              <p className="text-[12px] text-[var(--t2m-ink-3)]">
                Colle un lien YouTube, Spotify, Deezer, Apple Music…
              </p>
              <input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlError(null);
                }}
                placeholder="https://…"
                className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-2xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]"
              />
              {urlError && <p className="text-[12px] text-red-500">{urlError}</p>}
              <button
                onClick={handleUrlAdd}
                disabled={!urlInput.trim() || urlLoading}
                className="w-full rounded-2xl bg-red-500/15 border border-red-400/30 text-red-600 text-[13px] py-2.5 hover:bg-red-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {urlLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Ajouter ce lien
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] transition ' +
        (active
          ? 'text-[var(--t2m-ink)] border-b-2 border-red-400'
          : 'text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] border-b-2 border-transparent')
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TrackList({
  tracks,
  loading,
  onSelect,
  emptyMsg,
}: {
  tracks: ApiTrack[];
  loading: boolean;
  onSelect: (t: ApiTrack) => void;
  emptyMsg: string;
}) {
  if (loading && tracks.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--t2m-ink-3)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!tracks || tracks.length === 0) {
    return (
      <div className="p-6 text-center text-[12px] text-[var(--t2m-ink-3)]">{emptyMsg}</div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--t2m-line)]">
      {tracks.map((t) => (
        <li key={t.id}>
          <button
            onClick={() => onSelect(t)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--t2m-wash)] transition"
          >
            <img
              src={
                t.thumbnail_url ??
                `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`
              }
              alt=""
              className="w-12 h-12 rounded-md object-cover flex-shrink-0 bg-[var(--t2m-wash)]"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[var(--t2m-ink)] truncate flex items-center gap-1.5">
                {t.title}
                {t.is_official && (
                  <span className="text-[9px] text-red-500 border border-red-400/30 rounded px-1 py-px">
                    Officiel
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--t2m-ink-3)] truncate">
                {t.artist_name}
                {t.duration_sec
                  ? ' · ' + formatDuration(t.duration_sec)
                  : ''}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
