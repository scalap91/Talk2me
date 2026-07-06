'use client';

/**
 * VideoPicker — sous-écran du ActivityPicker (kind='video').
 *
 * Permet de chercher une vidéo YouTube (via /api/search/youtube?q=&limit=5)
 * et de la sélectionner pour démarrer une activité synchronisée. La création
 * d'activité (POST /api/activities/start) est faite par le parent via
 * `onSelect`.
 *
 * Doctrine : pas de lien externe, pas de copier/coller. On reste dans Talk2Me.
 */

import { useState } from 'react';
import { Search, ArrowLeft, Loader2 } from '@/lib/icons';

export interface YTSearchResult {
  video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

interface VideoPickerProps {
  onBack: () => void;
  onSelect: (video: YTSearchResult) => void;
}

export default function VideoPicker({ onBack, onSelect }: VideoPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YTSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}&limit=5`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if ('videos' in data && Array.isArray(data.videos)) {
        setResults(data.videos);
        if (data.videos.length === 0) setErr('Aucun résultat');
      } else {
        setResults([]);
        setErr('Aucun résultat');
      }
    } catch {
      setErr('Erreur de recherche');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1.5 text-white/55 hover:text-white/90"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-[14px] font-medium text-white/95">Choisir une vidéo</div>
      </div>

      {/* Search bar */}
      <form onSubmit={search} className="px-4 py-3 border-b border-white/8">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher sur YouTube…"
            autoFocus
            className="w-full h-10 pl-9 pr-3 rounded-full bg-white/10 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-red-500/40 text-sm"
          />
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center justify-center py-12 text-white/55 text-[13px] gap-2">
            <Loader2 size={16} className="animate-spin" />
            Recherche…
          </div>
        )}
        {!loading && err && (
          <div className="text-center text-white/45 text-[13px] py-12">{err}</div>
        )}
        {!loading && results.length === 0 && !err && (
          <div className="text-center text-white/45 text-[13px] py-12">
            Tape un titre, un artiste, un sujet…
          </div>
        )}
        <ul className="space-y-1">
          {results.map((v) => (
            <li key={v.video_id}>
              <button
                type="button"
                onClick={() => onSelect(v)}
                className="w-full flex gap-3 items-start text-left px-2 py-2 rounded-2xl hover:bg-white/[0.06] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.thumbnail}
                  alt=""
                  className="w-28 h-16 rounded-lg object-cover bg-black/40 shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="text-[13px] font-medium text-white/95 line-clamp-2 leading-snug">
                    {v.title || `Vidéo ${v.video_id}`}
                  </div>
                  <div className="text-[11px] text-white/55 mt-1 truncate">
                    {v.channel || 'YouTube'}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
