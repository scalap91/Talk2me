'use client';

/**
 * Talk2Me — Console MODE DJ = MIXEUR VIDÉO (Pascal 2026-06-09).
 * En haut : 2 lecteurs YouTube SUPERPOSÉS (deck A / deck B). Le CROSSFADER fond
 * l'un dans l'autre quand on bouge le curseur — fondu VISUEL (opacité) + AUDIO
 * (volume), en puissance constante. Lecteurs VISIBLES → conforme YouTube.
 * En bas : play/tempo par deck + ta playlist (tap = charge sur la platine armée).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from '@/lib/icons';
import { loadYouTubeApi } from '@/lib/dj/yt-loader';

export interface DJTrack {
  kind?: 'youtube' | 'audio';
  youtube_video_id?: string;
  audio_url?: string;
  title: string;
  artist_name: string | null;
  thumbnail_url: string | null;
}

interface LibEntry { id: string; name: string; category: string; file: string }
interface DeckTrack { youtube_video_id: string; title: string; artist_name: string | null; thumbnail_url: string | null }

const RATES = [0.75, 0.9, 1, 1.1, 1.25] as const;

export default function DJConsole({ tracks, onClose }: { tracks: DJTrack[]; onClose: () => void }) {
  const [deckA, setDeckA] = useState<DeckTrack | null>(null);
  const [deckB, setDeckB] = useState<DeckTrack | null>(null);
  const [armed, setArmed] = useState<'A' | 'B'>('A');
  const [cross, setCross] = useState(0.5);
  const [playingA, setPlayingA] = useState(false);
  const [playingB, setPlayingB] = useState(false);
  const [rateA, setRateA] = useState(2);
  const [rateB, setRateB] = useState(2);

  // Playlist : YouTube uniquement ici (le mixeur vidéo joue des vidéos YouTube).
  const ytTracks = tracks.filter((t) => t.youtube_video_id);
  const [fallback, setFallback] = useState<DJTrack[]>([]);
  useEffect(() => {
    if (ytTracks.length > 0) return;
    let alive = true;
    (async () => {
      const map = (arr: unknown): DJTrack[] => (Array.isArray(arr) ? arr : []).map((t) => {
        const x = t as Record<string, unknown>; const vid = String(x.youtube_video_id || '');
        return { youtube_video_id: vid, title: String(x.title || ''), artist_name: (x.artist_name as string) ?? null, thumbnail_url: (x.thumbnail_url as string) || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null) };
      }).filter((t) => t.youtube_video_id);
      try {
        const me = await fetch('/api/music/for-me', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null);
        let list = map(me?.mine);
        if (list.length === 0) { const tr = await fetch('/api/music/trending?limit=40', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null); list = map(tr?.tracks || tr); }
        if (alive) setFallback(list);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [ytTracks.length]);
  const list = ytTracks.length > 0 ? ytTracks : fallback;

  // ---- 2 lecteurs YouTube ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pA = useRef<any>(null); const pB = useRef<any>(null);
  const hostA = useRef<HTMLDivElement>(null); const hostB = useRef<HTMLDivElement>(null);
  const readyA = useRef(false); const readyB = useRef(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const YT = await loadYouTubeApi();
      if (cancel) return;
      const mk = (host: HTMLDivElement | null, onReady: () => void, onState: (n: number) => void) =>
        host && new YT.Player(host, {
          width: '100%', height: '100%',
          playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          events: { onReady, onStateChange: (e: any) => onState(e.data) },
        });
      pA.current = mk(hostA.current, () => { readyA.current = true; try { pA.current.setVolume(Math.round(Math.cos((cross * Math.PI) / 2) * 100)); } catch { /* */ } }, (n) => { if (n === 1) setPlayingA(true); else if (n === 2 || n === 0) setPlayingA(false); });
      pB.current = mk(hostB.current, () => { readyB.current = true; try { pB.current.setVolume(Math.round(Math.sin((cross * Math.PI) / 2) * 100)); } catch { /* */ } }, (n) => { if (n === 1) setPlayingB(true); else if (n === 2 || n === 0) setPlayingB(false); });
    })();
    return () => { cancel = true; try { pA.current?.destroy?.(); } catch { /* */ } try { pB.current?.destroy?.(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge les morceaux
  useEffect(() => { if (!readyA.current || !deckA) return; try { (playingA ? pA.current.loadVideoById : pA.current.cueVideoById).call(pA.current, deckA.youtube_video_id); } catch { /* */ } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [deckA?.youtube_video_id]);
  useEffect(() => { if (!readyB.current || !deckB) return; try { (playingB ? pB.current.loadVideoById : pB.current.cueVideoById).call(pB.current, deckB.youtube_video_id); } catch { /* */ } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [deckB?.youtube_video_id]);

  // Crossfade : volume (puissance constante). Opacité gérée au rendu.
  const volA = Math.cos((cross * Math.PI) / 2);
  const volB = Math.sin((cross * Math.PI) / 2);
  useEffect(() => { try { pA.current?.setVolume(Math.round(volA * 100)); } catch { /* */ } try { pB.current?.setVolume(Math.round(volB * 100)); } catch { /* */ } }, [cross, volA, volB]);
  useEffect(() => { try { pA.current?.setPlaybackRate(RATES[rateA]); } catch { /* */ } }, [rateA]);
  useEffect(() => { try { pB.current?.setPlaybackRate(RATES[rateB]); } catch { /* */ } }, [rateB]);

  const toggle = useCallback((deck: 'A' | 'B') => {
    const p = deck === 'A' ? pA.current : pB.current;
    const playing = deck === 'A' ? playingA : playingB;
    if (!p) return;
    try { if (playing) p.pauseVideo(); else p.playVideo(); } catch { /* */ }
  }, [playingA, playingB]);

  const loadTrack = (t: DJTrack) => {
    const dt: DeckTrack = { youtube_video_id: t.youtube_video_id!, title: t.title, artist_name: t.artist_name, thumbnail_url: t.thumbnail_url };
    if (armed === 'A') { setDeckA(dt); setArmed('B'); } else { setDeckB(dt); setArmed('A'); }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-[#08080c] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/8">
        <span className="text-[14px] font-bold tracking-wide">🎧 Mode DJ — mixeur vidéo</span>
        <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white" aria-label="Fermer"><X className="w-5 h-5" /></button>
      </div>

      {/* Desktop : 2 colonnes (scène + platines à gauche, playlist en rail à droite). */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-6 lg:px-6 lg:py-5 lg:max-w-6xl lg:mx-auto lg:w-full overflow-hidden">

      {/* SCÈNE VIDÉO : 2 lecteurs SUPERPOSÉS, fondus par le crossfader */}
      <div className="shrink-0 lg:flex-1 lg:min-w-0 lg:overflow-y-auto px-3 pt-3 lg:px-0 lg:pt-0">
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
          {/* Deck A (dessous) */}
          <div className="absolute inset-0" style={{ opacity: Math.min(1, volA * 1.6) }}>
            <div ref={hostA} className="w-full h-full" />
          </div>
          {/* Deck B (dessus, fondu par-dessus A) */}
          <div className="absolute inset-0" style={{ opacity: Math.min(1, volB * 1.6) }}>
            <div ref={hostB} className="w-full h-full" />
          </div>
          {/* badges decks */}
          <span className="absolute top-2 left-2 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">A</span>
          <span className="absolute top-2 right-2 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">B</span>
        </div>

        {/* CROSSFADER */}
        <div className="mt-3 px-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-white/60 w-4 text-center">A</span>
            <input type="range" min={0} max={1} step={0.01} value={cross} onChange={(e) => setCross(parseFloat(e.target.value))} className="flex-1 accent-red-500" aria-label="Crossfader" />
            <span className="text-[11px] font-bold text-white/60 w-4 text-center">B</span>
          </div>
          <div className="text-center text-[9px] text-white/35 mt-0.5">crossfader — fond A ⟷ B</div>
        </div>

        {/* Contrôles par deck */}
        <div className="grid grid-cols-2 gap-2.5 mt-2">
          {([['A', deckA, playingA, rateA, setRateA] as const, ['B', deckB, playingB, rateB, setRateB] as const]).map(([side, deck, playing, rate, setRate]) => (
            <div key={side} className={'rounded-xl p-2 lg:p-4 border ' + (armed === side ? 'border-red-400/60 bg-red-500/5' : 'border-white/10 bg-white/[0.03]')}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-red-200">Platine {side}</span>
                <button onClick={() => setArmed(side)} className={'text-[9px] px-1.5 py-0.5 rounded-full border ' + (armed === side ? 'border-red-400/60 text-red-100 bg-red-500/20' : 'border-white/15 text-white/50')}>{armed === side ? 'armée' : 'charger ici'}</button>
              </div>
              <p className="text-[10px] text-white/70 line-clamp-1 mt-1 min-h-[14px]">{deck?.title || '—'}</p>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => toggle(side)} disabled={!deck} className="shrink-0 w-9 h-9 lg:w-12 lg:h-12 rounded-full bg-red-600 disabled:opacity-30 flex items-center justify-center active:scale-95">
                  {playing ? <Pause className="w-4 h-4 lg:w-5 lg:h-5" /> : <Play className="w-4 h-4 lg:w-5 lg:h-5 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <input type="range" min={0} max={RATES.length - 1} step={1} value={rate} onChange={(e) => setRate(parseInt(e.target.value, 10))} className="w-full accent-red-500" aria-label="Tempo" />
                  <div className="text-center text-[9px] text-white/40 leading-none">tempo ×{RATES[rate]}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PLAYLIST (rail droit sur desktop) */}
      <div className="flex-1 min-h-0 lg:flex-none lg:w-96 lg:shrink-0 overflow-y-auto px-3 py-2 mt-1 lg:mt-0 border-t lg:border-t-0 lg:border-l border-white/8">
        <p className="text-[11px] text-white/45 mb-2 sticky top-0 bg-[#08080c] py-1">Ta playlist — tape un son pour la platine <span className="text-red-300 font-bold">{armed}</span></p>
        {list.length === 0 ? (
          <p className="text-center text-white/35 text-[12px] py-10">Aucun son pour le moment.</p>
        ) : (
          <div className="space-y-1">
            {list.map((t, i) => (
              <button key={(t.youtube_video_id || '') + i} type="button" onClick={() => loadTrack(t)} className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/[0.05] active:bg-white/[0.08] text-left">
                <span className="w-10 h-10 rounded-lg overflow-hidden bg-white/10 shrink-0">
                  {t.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail_url} alt="" className="w-full h-full object-cover" draggable={false} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-white/90 line-clamp-1">{t.title}</span>
                  <span className="block text-[10px] text-white/45 line-clamp-1">{t.artist_name || ''}</span>
                </span>
                <span className="text-[10px] text-red-300/80 shrink-0 px-1.5">→ {armed}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
