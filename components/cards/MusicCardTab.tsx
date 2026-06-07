'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-06) — Onglet "Music Card" (page Card /drafts).
 * Bibliothèque music-hub comme lieu autonome + Memory Score personnel.
 *
 * Onglets : Pour moi (perso, scoré par récence) / Tendance / Artistes A-Z /
 * Recherche.
 *  - ▶ Play  = écoute INLINE dans la liste (mini-player, miniature active) + log
 *  - Clic cover/titre = vidéo CENTRÉE au milieu de la page + log
 *  - +       = créer une card avec ce son déjà attaché (disque vinyle)
 * Chaque écoute alimente /api/music/play → score perso → "Pour moi" remonte tes
 * sons les plus écoutés en haut, score affiché. Doctrine passthrough (0 octet
 * audio, embed YouTube officiel).
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Search, TrendingUp, ListMusic, Sparkles, Play, Plus, GripVertical } from 'lucide-react';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import { useCardCreationStore } from '@/lib/card-creation-store';
import MusicPlayerFeed from '@/components/cards/MusicPlayerFeed';

interface ApiTrack {
  id: number;
  youtube_video_id: string;
  youtube_url: string;
  title: string;
  artist_name: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  view_count: number | null;
  is_official?: boolean;
  genre?: string | null;
  // Memory Score (présent uniquement dans "Pour moi")
  score?: number;
  play_count?: number;
}

interface GenreScore {
  genre: string;
  play_count: number;
  score: number;
}

type SubTab = 'forme' | 'trending' | 'artists' | 'search';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function fmtViews(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Md vues`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M vues`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K vues`;
  return `${n} vues`;
}

function metaLine(t: ApiTrack): string {
  return [t.artist_name ?? '', fmtViews(t.view_count), fmtDuration(t.duration_sec)]
    .filter(Boolean)
    .join(' · ');
}

function thumbOf(t: ApiTrack): string {
  return t.thumbnail_url ?? `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`;
}

function trackToUnifiedCard(t: ApiTrack): UnifiedCard {
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
    },
    actions: [
      {
        kind: 'open',
        label: 'Voir sur YouTube',
        url: t.youtube_url || `https://www.youtube.com/watch?v=${t.youtube_video_id}`,
      },
    ],
  } as UnifiedCard;
}

/** Enregistre une écoute (fire-and-forget) pour le Memory Score. */
function logPlay(t: ApiTrack, seconds: number): void {
  if (!t?.youtube_video_id || seconds < 4) return; // survol < 4s → ignoré
  try {
    fetch('/api/music/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track_id: t.id || null,
        youtube_video_id: t.youtube_video_id,
        title: t.title,
        artist_name: t.artist_name,
        genre: t.genre ?? null,
        seconds: Math.round(seconds),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

export default function MusicCardTab() {
  const [sub, setSub] = useState<SubTab>('forme');
  const openSheet = useCardCreationStore((s) => s.openSheet);

  const createWithSound = useCallback(
    (t: ApiTrack) => openSheet(trackToUnifiedCard(t)),
    [openSheet]
  );

  // Pour moi (Memory Score)
  const [mine, setMine] = useState<ApiTrack[]>([]);
  const [similar, setSimilar] = useState<ApiTrack[]>([]);
  const [discover, setDiscover] = useState<ApiTrack[]>([]);
  const [genres, setGenres] = useState<GenreScore[]>([]);
  const [topArtist, setTopArtist] = useState<string | null>(null);
  const [formeLoading, setFormeLoading] = useState(false);

  // Tendance
  const [trending, setTrending] = useState<ApiTrack[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);

  // Artistes A-Z
  const [letter, setLetter] = useState<string | null>(null);
  const [letterTracks, setLetterTracks] = useState<ApiTrack[]>([]);
  const [letterLoading, setLetterLoading] = useState(false);

  // Recherche
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ApiTrack[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Lecture
  const [inlineId, setInlineId] = useState<string | null>(null); // écoute inline
  const [feed, setFeed] = useState<{ list: ApiTrack[]; startId: string } | null>(null); // feed lecteur

  // ----- Glisser-déposer "Pour moi" : score entre voisins (persiste) -----
  const [dragVid, setDragVid] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const mineRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const dragStartY = useRef(0);
  const dragStartIdx = useRef(-1);

  const onHandleDown = (vid: string, index: number, e: ReactPointerEvent) => {
    e.preventDefault();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    setDragVid(vid);
    dragStartY.current = e.clientY;
    dragStartIdx.current = index;
    setHoverIdx(index);
    setDragY(0);
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    if (!dragVid) return;
    setDragY(e.clientY - dragStartY.current);
    let hi = dragStartIdx.current;
    for (let i = 0; i < mine.length; i++) {
      const el = mineRowRefs.current.get(mine[i].youtube_video_id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        hi = i;
        break;
      }
      hi = i;
    }
    if (hi !== hoverIdx) setHoverIdx(hi);
  };
  const onHandleUp = () => {
    if (!dragVid) return;
    const from = dragStartIdx.current;
    const to = hoverIdx ?? from;
    setDragVid(null);
    setHoverIdx(null);
    setDragY(0);
    if (from === to || from < 0) return;
    const arr = [...mine];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    // Score ENTRE les voisins (Pascal : "inférieur à celle du dessus, supérieur
    // à celle du dessous"). La position est la conséquence du score.
    const above = arr[to - 1];
    const below = arr[to + 1];
    let newScore: number;
    if (!above) newScore = (below?.score ?? moved.score ?? 1) + 1;
    else if (!below) newScore = Math.max(0.1, (above.score ?? 1) - 1);
    else newScore = ((above.score ?? 0) + (below.score ?? 0)) / 2;
    newScore = Math.round(newScore * 10) / 10;
    arr[to] = { ...moved, score: newScore, is_official: moved.is_official };
    setMine(arr);
    fetch('/api/music/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtube_video_id: moved.youtube_video_id,
        score: newScore,
        title: moved.title,
        artist_name: moved.artist_name,
        genre: moved.genre ?? null,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const loadForMe = useCallback(() => {
    setFormeLoading(true);
    // Normalise : "mine" (Memory Score) porte track_id+score, "similar/discover"
    // (music-hub) portent id+thumbnail+vues. On unifie vers ApiTrack.
    const norm = (m: any): ApiTrack => ({
      id: typeof m?.id === 'number' ? m.id : m?.track_id ?? 0,
      youtube_video_id: m?.youtube_video_id ?? '',
      youtube_url:
        m?.youtube_url ?? `https://www.youtube.com/watch?v=${m?.youtube_video_id ?? ''}`,
      title: m?.title ?? '',
      artist_name: m?.artist_name ?? null,
      thumbnail_url: m?.thumbnail_url ?? null,
      duration_sec: m?.duration_sec ?? null,
      view_count: m?.view_count ?? null,
      is_official: m?.is_official ?? false,
      genre: m?.genre ?? null,
      score: typeof m?.score === 'number' ? m.score : undefined,
      play_count: typeof m?.play_count === 'number' ? m.play_count : undefined,
    });
    fetch('/api/music/for-me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        setMine(Array.isArray(j?.mine) ? j.mine.map(norm) : []);
        setSimilar(Array.isArray(j?.similar) ? j.similar.map(norm) : []);
        setDiscover(Array.isArray(j?.discover) ? j.discover.map(norm) : []);
        setGenres(Array.isArray(j?.genres) ? j.genres : []);
        setTopArtist(typeof j?.top_artist === 'string' ? j.top_artist : null);
      })
      .catch(() => {})
      .finally(() => setFormeLoading(false));
  }, []);

  // Recharge "Pour moi" à CHAQUE fois qu'on (r)entre sur l'onglet : après une
  // écoute le score a changé, le classement doit être frais. L'effet ne dépend
  // que de `sub` (loadForMe est stable) → pas de boucle même si mine reste vide.
  useEffect(() => {
    if (sub === 'forme') loadForMe();
  }, [sub, loadForMe]);

  // Après une écoute, le score change → on rafraîchit "Pour moi". Délai court =
  // laisser le POST keepalive /api/music/play atterrir avant de relire le top.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleForMeRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => loadForMe(), 800);
  }, [loadForMe]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );

  useEffect(() => {
    if (sub !== 'trending' || trending.length > 0) return;
    setTrendingLoading(true);
    fetch('/api/music/trending?limit=30', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((j) => setTrending(Array.isArray(j?.tracks) ? j.tracks : []))
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoading(false));
  }, [sub, trending.length]);

  const loadLetter = useCallback((l: string) => {
    setLetter(l);
    setLetterLoading(true);
    fetch(`/api/music/alphabet?letter=${encodeURIComponent(l)}&limit=40`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((j) => setLetterTracks(Array.isArray(j?.tracks) ? j.tracks : []))
      .catch(() => setLetterTracks([]))
      .finally(() => setLetterLoading(false));
  }, []);

  useEffect(() => {
    if (sub !== 'search') return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/music/search?q=${encodeURIComponent(term)}&limit=30`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { tracks: [] }))
        .then((j) => setResults(Array.isArray(j?.tracks) ? j.tracks : []))
        .catch(() => setResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, sub]);

  // Chrono écoute inline (▶ dans la liste) : on logge la durée à l'arrêt.
  const inlineSinceRef = useRef<number>(0);
  const inlineTrackRef = useRef<ApiTrack | null>(null);
  const commitInline = useCallback(() => {
    const t = inlineTrackRef.current;
    if (t && inlineSinceRef.current > 0) {
      logPlay(t, (Date.now() - inlineSinceRef.current) / 1000);
    }
    inlineTrackRef.current = null;
    inlineSinceRef.current = 0;
  }, []);
  useEffect(() => () => commitInline(), [commitInline]); // démontage → log

  // ▶ écoute inline dans la liste (mini-player).
  const onInline = useCallback(
    (t: ApiTrack) => {
      setFeed(null);
      setInlineId((cur) => {
        const turningOff = cur === t.youtube_video_id;
        commitInline();
        if (turningOff) return null;
        inlineTrackRef.current = t;
        inlineSinceRef.current = Date.now();
        return t.youtube_video_id;
      });
      scheduleForMeRefresh(); // l'écoute qu'on vient de clore re-classe le top
    },
    [commitInline, scheduleForMeRefresh]
  );
  // Clic cover/titre → ouvre le FEED lecteur (≈3 cards/écran, même ordre).
  const onOpen = (t: ApiTrack) => {
    const list =
      sub === 'forme'
        ? [...mine, ...similar, ...discover]
        : sub === 'trending'
          ? trending
          : sub === 'search'
            ? results
            : letterTracks;
    const seen = new Set<string>();
    const uniq = list.filter((x) => {
      if (!x.youtube_video_id || seen.has(x.youtube_video_id)) return false;
      seen.add(x.youtube_video_id);
      return true;
    });
    commitInline();
    setInlineId(null);
    setFeed({ list: uniq.length ? uniq : [t], startId: t.youtube_video_id });
  };

  // ----- rendu d'une ligne (réutilisé partout) -----
  const renderRow = (t: ApiTrack, showScore: boolean, drag?: { index: number }) => {
    const isInline = inlineId === t.youtube_video_id;
    const isDragging = !!drag && dragVid === t.youtube_video_id;
    return (
      <li
        key={`${t.id}-${t.youtube_video_id}`}
        ref={
          drag
            ? (el) => {
                if (el) mineRowRefs.current.set(t.youtube_video_id, el);
                else mineRowRefs.current.delete(t.youtube_video_id);
              }
            : undefined
        }
        className={'py-1.5 ' + (isDragging ? 'relative z-20' : '')}
        style={
          isDragging
            ? { transform: `translateY(${dragY}px)`, transition: 'none' }
            : undefined
        }
      >
        <div
          className={
            'flex items-center gap-2 pr-0.5 ' +
            (isDragging ? 'rounded-xl bg-[#15151c] ring-2 ring-violet-400/60 shadow-2xl' : '')
          }
        >
          {drag && (
            <button
              type="button"
              aria-label="Déplacer"
              onPointerDown={(e) => onHandleDown(t.youtube_video_id, drag.index, e)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              className="shrink-0 w-7 h-12 flex items-center justify-center text-white/35 hover:text-white/70 touch-none cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(t)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg active:opacity-80"
          >
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbOf(t)}
                alt=""
                loading="lazy"
                className={
                  'w-[52px] h-[52px] rounded-[10px] object-cover bg-white/5 ring-1 ' +
                  (isInline ? 'ring-violet-400/70' : 'ring-white/8')
                }
              />
              {isInline && (
                <span className="absolute inset-0 flex items-end justify-center gap-0.5 rounded-[10px] bg-black/30 pb-1.5">
                  <span className="eqbar" />
                  <span className="eqbar eqbar2" />
                  <span className="eqbar eqbar3" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-white/95 truncate leading-tight">
                {t.title}
              </div>
              <div className="text-[12.5px] text-white/55 truncate mt-0.5">{metaLine(t)}</div>
              {showScore && typeof t.score === 'number' && (
                <div className="text-[11px] text-violet-300/90 mt-0.5">
                  🔥 score {t.score} · {t.play_count ?? 0} écoute
                  {(t.play_count ?? 0) > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </button>

          {/* ▶ écoute inline */}
          <button
            type="button"
            onClick={() => onInline(t)}
            aria-label={isInline ? 'Arrêter' : 'Écouter le son'}
            className={
              'shrink-0 w-9 h-9 rounded-full border flex items-center justify-center active:scale-95 transition ' +
              (isInline
                ? 'bg-violet-500/25 border-violet-400/50 text-violet-100'
                : 'bg-white/[0.06] border-white/10 text-white/85 hover:bg-white/[0.12]')
            }
          >
            <Play className="w-4 h-4 fill-current" />
          </button>

          {/* + créer une card avec ce son */}
          <button
            type="button"
            onClick={() => createWithSound(t)}
            aria-label="Créer une card avec ce son"
            className="shrink-0 w-9 h-9 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-100 hover:bg-violet-500/30 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Mini-player inline (écoute depuis la liste) */}
        {isInline && (
          <div className="mt-2 relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${t.youtube_video_id}?autoplay=1&modestbranding=1&rel=0&playsinline=1`}
              title={t.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        )}
      </li>
    );
  };

  const section = (title: string, tracks: ApiTrack[], showScore = false) =>
    tracks.length > 0 ? (
      <div className="mb-4">
        <div className="text-[12px] font-semibold text-white/45 uppercase tracking-wide px-0.5 mb-1">
          {title}
        </div>
        <ul className="divide-y divide-white/5">{tracks.map((t) => renderRow(t, showScore))}</ul>
      </div>
    ) : null;

  // Liste simple pour trending/artists/search
  const simpleList =
    sub === 'trending' ? trending : sub === 'search' ? results : letterTracks;
  const simpleLoading =
    sub === 'trending' ? trendingLoading : sub === 'search' ? searchLoading : letterLoading;

  return (
    <div data-testid="panel-music" className="px-4 pt-1">
      {/* Sous-onglets */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
        {(
          [
            { k: 'forme', label: 'Pour moi', icon: Sparkles },
            { k: 'trending', label: 'Tendance', icon: TrendingUp },
            { k: 'artists', label: 'Artistes', icon: ListMusic },
            { k: 'search', label: 'Recherche', icon: Search },
          ] as { k: SubTab; label: string; icon: typeof Search }[]
        ).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ' +
              (sub === k
                ? 'bg-violet-500/15 border-violet-400/30 text-violet-100'
                : 'bg-transparent border-white/8 text-white/55 hover:text-white/80')
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ===== POUR MOI ===== */}
      {sub === 'forme' && (
        <div>
          {formeLoading && (
            <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
          )}
          {!formeLoading && genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {genres.slice(0, 6).map((g) => (
                <span
                  key={g.genre}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/70"
                >
                  {g.genre} · {g.score}
                </span>
              ))}
            </div>
          )}
          {!formeLoading && mine.length === 0 && (
            <div className="text-center text-white/40 text-[12.5px] py-10 px-6">
              Écoute des sons (bouton ▶) — tes préférés remonteront ici, classés par
              ce que tu écoutes le plus.
            </div>
          )}
          {!formeLoading && mine.length > 0 && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between px-0.5 mb-1">
                <span className="text-[12px] font-semibold text-white/45 uppercase tracking-wide">
                  Ton top
                </span>
                <span className="text-[10px] text-white/30">glisse ⠿ pour réordonner</span>
              </div>
              <ul className="divide-y divide-white/5">
                {mine.map((t, i) => renderRow(t, true, { index: i }))}
              </ul>
            </div>
          )}
          {!formeLoading &&
            similar.length > 0 &&
            section(topArtist ? `Plus de ${topArtist}` : 'Similaires', similar)}
          {!formeLoading && section('Découvertes', discover)}
        </div>
      )}

      {/* ===== Barre de recherche ===== */}
      {sub === 'search' && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titre ou artiste…"
            autoFocus
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-violet-400/40"
          />
        </div>
      )}

      {/* ===== Alphabet ===== */}
      {sub === 'artists' && (
        <div className="flex flex-wrap gap-1 mb-3">
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => loadLetter(l)}
              className={
                'w-7 h-7 rounded-md text-[12px] font-medium border transition-colors ' +
                (letter === l
                  ? 'bg-violet-500/20 border-violet-400/40 text-violet-100'
                  : 'bg-white/[0.03] border-white/8 text-white/50 hover:text-white/80')
              }
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ===== Listes simples (trending / artists / search) ===== */}
      {sub !== 'forme' && (
        <>
          {simpleLoading && (
            <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
          )}
          {!simpleLoading && sub === 'artists' && !letter && (
            <div className="text-center text-white/40 text-[12.5px] py-12 px-6">
              Choisis une lettre pour voir les artistes indexés.
            </div>
          )}
          {!simpleLoading && sub === 'search' && q.trim().length < 2 && (
            <div className="text-center text-white/40 text-[12.5px] py-12 px-6">
              Tape un nom de titre ou d’artiste.
            </div>
          )}
          {!simpleLoading &&
            simpleList.length === 0 &&
            !(sub === 'artists' && !letter) &&
            !(sub === 'search' && q.trim().length < 2) && (
              <div className="text-center text-white/40 text-[12.5px] py-12 px-6">
                Rien ici pour l’instant. Le crawler enrichit la bibliothèque en continu.
              </div>
            )}
          {!simpleLoading && simpleList.length > 0 && (
            <ul className="divide-y divide-white/5 pb-4">
              {simpleList.map((t) => renderRow(t, false))}
            </ul>
          )}
        </>
      )}

      {/* ===== Feed lecteur (clic) : ≈3 cards/écran, même ordre, scroll ===== */}
      {feed && (
        <MusicPlayerFeed
          tracks={feed.list}
          startId={feed.startId}
          onClose={() => {
            setFeed(null);
            scheduleForMeRefresh(); // les sons écoutés dans le feed re-classent le top
          }}
          onPlus={(t) => createWithSound(t as ApiTrack)}
          onPlay={(t, seconds) => logPlay(t as ApiTrack, seconds)}
        />
      )}

      <style jsx>{`
        .eqbar {
          width: 3px;
          height: 8px;
          background: rgba(196, 181, 253, 0.95);
          border-radius: 2px;
          animation: eq 0.8s ease-in-out infinite;
        }
        .eqbar2 {
          animation-delay: 0.25s;
        }
        .eqbar3 {
          animation-delay: 0.5s;
        }
        @keyframes eq {
          0%,
          100% {
            height: 5px;
          }
          50% {
            height: 14px;
          }
        }
      `}</style>
    </div>
  );
}
