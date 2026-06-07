'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-06) — MusicPlayerFeed.
 *
 * Au clic sur un son dans Music Card → FEED vertical de cards-son : ≈3 visibles
 * par écran, MÊME ORDRE que la liste d'où on vient, positionné sur le son
 * cliqué. On scrolle pour découvrir/écouter la suite.
 *
 * Lecture au scroll (Pascal 2026-06-06) : si la card joue, quand on scrolle la
 * SUIVANTE (la plus centrée) se lance toute seule et la précédente s'arrête.
 * Si on a mis en PAUSE → scroller ne lance rien, tout reste en pause jusqu'à ce
 * qu'on retape Play.
 *
 * Une seule vidéo joue à la fois (la card active+lecture porte l'iframe).
 * Chaque son lancé compte comme une écoute (score). Passthrough YouTube.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Plus, ExternalLink } from 'lucide-react';

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

export default function MusicPlayerFeed({ tracks, startId, onClose, onPlus, onPlay }: Props) {
  const [activeId, setActiveId] = useState(startId);
  const [playing, setPlaying] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeRef = useRef(startId);
  const playingRef = useRef(true);

  // Chrono de la durée d'écoute : on logge à l'ARRÊT (changement de son /
  // pause / fermeture), pas au démarrage → le scroll-survol ne compte pas.
  const sinceRef = useRef<number>(0);
  const playTrackRef = useRef<FeedTrack | null>(null);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Commit de la durée écoutée du son courant (puis remet le chrono à zéro).
  const commit = () => {
    const t = playTrackRef.current;
    if (t && sinceRef.current > 0) {
      onPlay(t, (Date.now() - sinceRef.current) / 1000);
    }
    sinceRef.current = 0;
  };
  // Démarre/relance le chrono sur un son.
  const startTimer = (t: FeedTrack | null) => {
    playTrackRef.current = t;
    sinceRef.current = t ? Date.now() : 0;
  };

  // Montage : positionne sur le son cliqué + démarre le chrono (pas de log).
  useEffect(() => {
    cardRefs.current.get(startId)?.scrollIntoView({ block: 'start' });
    const t = tracks.find((x) => x.youtube_video_id === startId) ?? null;
    startTimer(t);
    // Démontage / fermeture → on logge la durée finale.
    return () => commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoplay au scroll : la card la PLUS centrée devient active — mais
  // SEULEMENT si on est en lecture (sinon scroller ne relance rien).
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
          if (r > best) {
            best = r;
            bestId = id;
          }
        }
        if (bestId && bestId !== activeRef.current && best > 0.55) {
          commit(); // logge la durée du son qu'on quitte
          activeRef.current = bestId;
          setActiveId(bestId);
          const t = tracks.find((x) => x.youtube_video_id === bestId) ?? null;
          startTimer(t);
        }
      },
      { root, threshold: [0, 0.25, 0.4, 0.55, 0.75, 1] }
    );
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Tap sur une cover → cette card joue (lecture ON).
  const playCard = (t: FeedTrack) => {
    commit();
    activeRef.current = t.youtube_video_id;
    setActiveId(t.youtube_video_id);
    setPlaying(true);
    startTimer(t);
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
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 snap-y snap-mandatory scroll-smooth"
      >
        {tracks.map((t) => {
          const isActive = activeId === t.youtube_video_id;
          const isLive = isActive && playing; // joue réellement
          const isStart = t.youtube_video_id === startId;
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
                (isActive ? 'border-violet-400/40' : 'border-white/10')
              }
            >
              <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
                {isLive ? (
                  <>
                    <iframe
                      src={`https://www.youtube.com/embed/${t.youtube_video_id}?autoplay=1&modestbranding=1&rel=0&playsinline=1`}
                      title={t.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full border-0"
                    />
                    {/* Pause : coupe la lecture → plus d'autoplay au scroll */}
                    <button
                      type="button"
                      onClick={() => {
                        commit();
                        setPlaying(false);
                      }}
                      aria-label="Pause"
                      className="absolute top-2 left-2 z-10 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white/90 hover:bg-black/75"
                    >
                      <Pause className="w-4 h-4 fill-current" />
                    </button>
                  </>
                ) : (
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
                    className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-100 hover:bg-violet-500/30"
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
