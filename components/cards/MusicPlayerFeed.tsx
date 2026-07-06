'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-06/07) — MusicPlayerFeed.
 *
 * Au clic sur un son dans Music Card → FEED vertical de cards-son : ≈3 visibles
 * par écran, MÊME ORDRE que la liste d'où on vient, positionné sur le son
 * cliqué. On scrolle pour découvrir/écouter la suite.
 *
 * ANTI-"TAC" (Pascal 2026-06-07) : un SEUL player YouTube persistant (IFrame
 * API) reste monté en permanence et se superpose à la card active. Passer d'un
 * son à l'autre = `loadVideoById` sur le MÊME player (jamais de remontage
 * d'iframe) → plus de teardown/boot audio = plus de "tac". Le player reste
 * chaud : en fin de morceau il enchaîne tout seul « le son d'après ».
 *
 * Lecture au scroll : si on est en lecture, la card la plus centrée devient
 * active et le player y charge son son. En PAUSE, scroller ne relance rien.
 * Chaque son écouté compte comme une écoute (score). Passthrough YouTube.
 */

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { X, Play, Plus, ExternalLink } from '@/lib/icons';

export interface FeedTrack {
  id: number;
  youtube_video_id: string;
  youtube_url?: string | null;
  title: string;
  artist_name: string | null;
  thumbnail_url?: string | null;
}

interface Props {
  tracks: FeedTrack[];
  startId: string;
  onClose: () => void;
  onPlus: (t: FeedTrack) => void;
  onPlay: (t: FeedTrack, seconds: number) => void;
}

function thumb(t: FeedTrack): string {
  return t.thumbnail_url ?? `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`;
}
function ytUrl(t: FeedTrack): string {
  return t.youtube_url || `https://www.youtube.com/watch?v=${t.youtube_video_id}`;
}

/* ----- Chargement unique de l'IFrame API YouTube (singleton) ----- */
let ytApiPromise: Promise<unknown> | null = null;
function loadYouTubeApi(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') {
        try { prev(); } catch { /* noop */ }
      }
      resolve(w.YT);
    };
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

export default function MusicPlayerFeed({ tracks, startId, onClose, onPlus, onPlay }: Props) {
  const [activeId, setActiveId] = useState(startId);
  const [playing, setPlaying] = useState(true);
  // Géométrie de la card active (le player unique se superpose dessus).
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mediaRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeRef = useRef(startId);
  const playingRef = useRef(true);

  // Le player unique persistant + son hôte DOM (jamais démonté → pas de tac).
  const hostInnerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);

  // Chrono d'écoute : on logge la durée à l'ARRÊT (changement / pause / fermeture).
  const sinceRef = useRef<number>(0);
  const playTrackRef = useRef<FeedTrack | null>(null);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const trackById = useCallback(
    (id: string) => tracks.find((x) => x.youtube_video_id === id) ?? null,
    [tracks]
  );

  const commit = useCallback(() => {
    const t = playTrackRef.current;
    if (t && sinceRef.current > 0) {
      onPlay(t, (Date.now() - sinceRef.current) / 1000);
    }
    sinceRef.current = 0;
  }, [onPlay]);

  const startTimer = useCallback((t: FeedTrack | null) => {
    playTrackRef.current = t;
    sinceRef.current = t ? Date.now() : 0;
  }, []);

  // Bascule sur un son : MÊME player, juste loadVideoById → aucun remontage.
  const switchTo = useCallback(
    (id: string, autoplay: boolean) => {
      if (id !== activeRef.current) {
        commit();
        activeRef.current = id;
        setActiveId(id);
      }
      const p = playerRef.current;
      if (p && playerReadyRef.current) {
        if (autoplay) p.loadVideoById(id);
        else p.cueVideoById(id);
      }
    },
    [commit]
  );

  /* ----- Création unique du player (monté une fois pour toute la session feed) ----- */
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !YT || !hostInnerRef.current || playerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YTApi = YT as any;
      playerRef.current = new YTApi.Player(hostInnerRef.current, {
        videoId: startId,
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            if (playingRef.current) {
              try { playerRef.current.playVideo(); } catch { /* noop */ }
            }
          },
          onStateChange: (e: { data: number }) => {
            // 1 PLAYING · 2 PAUSED · 0 ENDED
            if (e.data === 1) {
              setPlaying(true);
              if (sinceRef.current === 0) startTimer(trackById(activeRef.current));
            } else if (e.data === 2) {
              commit();
              setPlaying(false);
            } else if (e.data === 0) {
              // Fin du morceau → enchaîne « le son d'après » sur le même player chaud.
              commit();
              const list = tracks;
              const idx = list.findIndex((x) => x.youtube_video_id === activeRef.current);
              const next = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
              if (next) {
                setPlaying(true);
                switchTo(next.youtube_video_id, true);
                mediaRefs.current.get(next.youtube_video_id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      commit();
      try { playerRef.current?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
      playerReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Montage : positionne le feed sur le son cliqué + démarre le chrono.
  useEffect(() => {
    mediaRefs.current.get(startId)?.scrollIntoView({ block: 'start' });
    startTimer(trackById(startId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcule la position du player sur la card active (et au resize).
  const reposition = useCallback(() => {
    const el = mediaRefs.current.get(activeId);
    if (!el) { setBox(null); return; }
    setBox({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight });
  }, [activeId]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition, tracks]);

  useEffect(() => {
    const onResize = () => reposition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [reposition]);

  // Autoplay au scroll : la card la PLUS centrée devient active — seulement en lecture.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const ratios = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.vid;
          if (id) ratios.set(id, e.intersectionRatio);
        }
        if (!playingRef.current) return; // pause → pas d'autoplay
        let bestId: string | null = null;
        let best = 0;
        for (const [id, r] of ratios) {
          if (r > best) { best = r; bestId = id; }
        }
        if (bestId && bestId !== activeRef.current && best > 0.55) {
          switchTo(bestId, true);
        }
      },
      { root, threshold: [0, 0.25, 0.4, 0.55, 0.75, 1] }
    );
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Tap sur une cover → cette card joue (lecture ON, même player).
  const playCard = (t: FeedTrack) => {
    setPlaying(true);
    switchTo(t.youtube_video_id, true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 h-12 shrink-0 bg-black/70 backdrop-blur border-b border-white/8">
        <span className="text-[14px] font-medium text-white/90">Lecteur</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center text-white/85 hover:bg-white/15"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 snap-y snap-mandatory scroll-smooth"
      >
        {/* Player UNIQUE persistant — superposé à la card active, jamais démonté. */}
        <div
          aria-hidden={!box}
          className="absolute z-20 overflow-hidden rounded-2xl bg-black pointer-events-auto"
          style={
            box
              ? { top: box.top, left: box.left, width: box.width, height: box.height }
              : { top: 0, left: 0, width: 0, height: 0, opacity: 0, pointerEvents: 'none' }
          }
        >
          <div ref={hostInnerRef} className="w-full h-full" />
        </div>

        {tracks.map((t) => {
          const isActive = activeId === t.youtube_video_id;
          return (
            <div
              key={`${t.id}-${t.youtube_video_id}`}
              data-vid={t.youtube_video_id}
              ref={(el) => {
                if (el) cardRefs.current.set(t.youtube_video_id, el);
                else cardRefs.current.delete(t.youtube_video_id);
              }}
              className={
                'snap-start snap-always scroll-mt-3 rounded-2xl overflow-hidden border bg-[#15151c] ' +
                (isActive ? 'border-red-400/40' : 'border-white/10')
              }
            >
              <div
                ref={(el) => {
                  if (el) mediaRefs.current.set(t.youtube_video_id, el);
                  else mediaRefs.current.delete(t.youtube_video_id);
                }}
                className="relative w-full bg-black"
                style={{ aspectRatio: '16 / 9' }}
              >
                {/* La card active est couverte par le player unique (au-dessus, z-20).
                    Les autres montrent leur miniature cliquable. */}
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => playCard(t)}
                    className="absolute inset-0 w-full h-full group"
                    aria-label={`Écouter ${t.title}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb(t)}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/45 transition-colors">
                      <span className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </span>
                    </span>
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-white/95 truncate">{t.title}</div>
                  <div className="text-[12px] text-white/50 truncate">{t.artist_name ?? ''}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={ytUrl(t)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Voir sur YouTube"
                    className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/12"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onPlus(t)}
                    aria-label="Créer une card avec ce son"
                    className="w-9 h-9 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-100 hover:bg-red-500/30"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="h-6" />
      </div>
    </div>
  );
}
