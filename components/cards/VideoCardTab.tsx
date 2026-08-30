'use client';
/**
 * VIDEO CARD (Pascal 2026-08-29, Phase 1) — jumeau de MusicCardTab pour les FILMS ENTIERS gratuits
 * de YouTube (embed officiel, 0 octet vidéo). Sous-onglets : Tendances · Genres · Recherche.
 * Tap un film → lecteur PLEIN ÉCRAN (iframe embed YouTube, comme le mini-player Music). Que du
 * contenu EMBEDDABLE (garanti par /api/video/*). On détourne l'existant, on ne rippe jamais.
 */
import { useEffect, useState, useCallback } from 'react';
import { X, Loader2 } from '@/lib/icons';

interface Film {
  video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration_sec: number;
  views: number | null;
  embed_url: string;
  youtube_url: string;
}
type Sub = 'tendances' | 'genres' | 'recherche';

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600); const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
}
function fmtViews(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M vues`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k vues`;
  return `${n} vues`;
}

export default function VideoCardTab() {
  const [sub, setSub] = useState<Sub>('tendances');
  const [genre, setGenre] = useState<string>('');
  const [genres, setGenres] = useState<string[]>([]);
  const [films, setFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<Film | null>(null);

  const loadCatalog = useCallback(async (g?: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/video/catalog${g ? `?genre=${encodeURIComponent(g)}` : ''}`, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (d?.ok) { setFilms(d.films || []); if (Array.isArray(d.genres) && !genres.length) setGenres(d.genres); }
    } finally { setLoading(false); }
  }, [genres.length]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setFilms([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/video/search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (d?.ok) setFilms(d.films || []);
    } finally { setLoading(false); }
  }, []);

  const pickGenre = (g: string) => { setGenre(g); setSub('genres'); loadCatalog(g); };

  return (
    <div data-testid="panel-video" className="flex flex-col min-h-0">
      {/* Sous-onglets */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        {([['tendances', 'Tendances'], ['genres', 'Genres'], ['recherche', 'Recherche']] as [Sub, string][]).map(([k, l]) => (
          <button key={k} type="button"
            onClick={() => { setSub(k); if (k === 'tendances') loadCatalog(); if (k === 'genres' && genre) loadCatalog(genre); if (k === 'recherche') setFilms([]); }}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${sub === k ? 'bg-[var(--t2m-ink)] text-white border-[var(--t2m-ink)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]'}`}>
            {l}
          </button>
        ))}
      </div>

      {sub === 'genres' && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
          {genres.map((g) => (
            <button key={g} type="button" onClick={() => pickGenre(g)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-medium border ${genre === g ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-paper)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]'}`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {sub === 'recherche' && (
        <form className="px-3 py-2" onSubmit={(e) => { e.preventDefault(); runSearch(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un film…"
            className="w-full h-10 px-4 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[14px] text-[var(--t2m-ink)] outline-none" />
        </form>
      )}

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--t2m-ink-3)]" /></div>
      ) : films.length === 0 ? (
        <div className="text-center text-[var(--t2m-ink-3)] text-[13px] py-16 px-6">
          {sub === 'recherche' ? 'Tape le nom d’un film et valide 🔎' : 'Aucun film pour l’instant.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 p-3">
          {films.map((f) => (
            <button key={f.video_id} type="button" onClick={() => setPlaying(f)} data-testid={`film-${f.video_id}`}
              className="block text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-paper)] active:opacity-90">
              <div className="relative aspect-video bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md grid place-items-center text-white text-[18px] pl-0.5">▶</span>
                </span>
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-semibold">{fmtDur(f.duration_sec)}</span>
              </div>
              <div className="px-2.5 py-2">
                <div className="text-[13px] font-semibold text-[var(--t2m-ink)] line-clamp-2 leading-snug">{f.title}</div>
                <div className="text-[11px] text-[var(--t2m-ink-3)] mt-1 truncate">{f.channel}{f.views != null ? ` · ${fmtViews(f.views)}` : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* LECTEUR PLEIN ÉCRAN — iframe embed YouTube officielle (même approche que Music Card). */}
      {playing && (
        <div className="fixed inset-0 z-[120] bg-black flex flex-col">
          <div className="flex items-center gap-2 px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 8px)', paddingBottom: 8 }}>
            <button type="button" onClick={() => setPlaying(null)} aria-label="Fermer" className="w-10 h-10 rounded-full bg-white/15 grid place-items-center text-white active:scale-95"><X className="w-5 h-5" /></button>
            <div className="flex-1 min-w-0 text-white text-[14px] font-semibold truncate">{playing.title}</div>
          </div>
          <div className="flex-1 min-h-0 grid place-items-center">
            <div className="w-full" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${playing.video_id}?autoplay=1&modestbranding=1&rel=0&playsinline=1`}
                title={playing.title}
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 text-white/70 text-[12px]">
            {playing.channel} · film gratuit (avec pub) via YouTube
          </div>
        </div>
      )}
    </div>
  );
}
