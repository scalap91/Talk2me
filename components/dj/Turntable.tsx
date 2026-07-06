'use client';

/**
 * Talk2Me — PLATINE DJ (un deck) (Pascal 2026-06-09).
 *
 * - Lecture du morceau de la playlist via YouTube IFrame (audio).
 * - Le DOIGT entraîne le vinyle : drag sur le disque → il tourne sous le doigt.
 * - Pendant le scratch : YouTube est mis en pause (ducké) et le moteur Web Audio
 *   (ScratchEngine) sort le son du scratch, piloté par la vélocité du doigt
 *   (reverse inclus). Au relâcher : on saute à la position "scratchée" et la
 *   lecture reprend → sensation de platine.
 * - Pitch/tempo : setPlaybackRate (paliers autorisés par YouTube).
 * - Volume : piloté par le crossfader parent (prop `volume` 0..1).
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { Play, Pause } from '@/lib/icons';
import { loadYouTubeApi } from '@/lib/dj/yt-loader';
import { ScratchEngine } from '@/lib/dj/scratch-engine';
import { AudioDeck } from '@/lib/dj/audio-deck';

export interface DeckTrack {
  /** 'youtube' = playlist YouTube (scratch synthé) ; 'audio' = son qu'on possède
   *  (biblio CC0 / upload) → VRAI scratch Web Audio. */
  kind: 'youtube' | 'audio';
  youtube_video_id?: string;
  audio_url?: string;
  title: string;
  artist_name: string | null;
  thumbnail_url: string | null;
}

const RATES = [0.75, 0.9, 1, 1.1, 1.25] as const; // paliers tempo (snap YouTube)
const SECONDS_PER_TURN = 1.8; // 1 tour de vinyle ≈ 1.8 s de morceau (33⅓ rpm)
const AUTO_DEG_PER_S = 360 / SECONDS_PER_TURN; // rotation auto en lecture

export default function Turntable({
  side,
  track,
  volume,
  armed,
  onArm,
}: {
  side: 'A' | 'B';
  track: DeckTrack | null;
  volume: number; // 0..1 (crossfader × master)
  armed: boolean;
  onArm: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const platterRef = useRef<HTMLDivElement>(null);
  const scratchRef = useRef<ScratchEngine | null>(null);
  const audioRef = useRef<AudioDeck | null>(null);

  const isAudio = track?.kind === 'audio';
  const isAudioRef = useRef(isAudio);
  isAudioRef.current = isAudio;

  const [playing, setPlaying] = useState(false);
  const [rateIdx, setRateIdx] = useState(2); // index dans RATES (1.0)
  const [hasTrack, setHasTrack] = useState(false);

  // Dernier id de morceau + volume, lus en closure fraîche dans onReady.
  const trackIdRef = useRef<string | null>(track?.youtube_video_id ?? null);
  trackIdRef.current = track?.youtube_video_id ?? null;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Rotation du vinyle (deg) gérée en rAF pour mêler auto-rotation + doigt.
  const rotRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const playingRef = useRef(false);
  playingRef.current = playing;

  // État du geste de scratch.
  const dragRef = useRef<{
    active: boolean;
    lastAngle: number;
    lastMoveTs: number;
    baseTime: number;
    scrubSec: number;
    wasPlaying: boolean;
  }>({ active: false, lastAngle: 0, lastMoveTs: 0, baseTime: 0, scrubSec: 0, wasPlaying: false });

  // ---- Boucle d'animation du vinyle ----
  useEffect(() => {
    const tick = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      if (!dragRef.current.active && playingRef.current) {
        rotRef.current = (rotRef.current + AUTO_DEG_PER_S * RATES[rateIdx] * dt) % 360;
      }
      if (platterRef.current) {
        platterRef.current.style.transform = `rotate(${rotRef.current}deg)`;
      }
      // Doigt immobile (>70 ms) pendant le scratch : on fige.
      if (dragRef.current.active && ts - dragRef.current.lastMoveTs > 70) {
        if (isAudioRef.current) audioRef.current?.scratchMove(0); // vinyle figé (silence)
        else scratchRef.current?.silence();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [rateIdx]);

  // ---- Création du lecteur YouTube ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const YT = await loadYouTubeApi();
      if (cancelled || !hostRef.current) return;
      const initId = trackIdRef.current;
      const opts: Record<string, unknown> = {
        // Taille réelle (≥200px) : YouTube REFUSE de jouer un lecteur invisible/
        // minuscule. On le rend visible pour le navigateur mais on le cache sous
        // le vinyle opaque (voir JSX). C'est le seul moyen d'avoir le son.
        width: '220',
        height: '220',
        playerVars: { autoplay: 0, controls: 0, playsinline: 1, modestbranding: 1, rel: 0, disablekb: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            try {
              playerRef.current.setVolume(Math.round(volumeRef.current * 100));
              // Cue le morceau courant (lu en ref → pas de closure périmée).
              if (trackIdRef.current) { playerRef.current.cueVideoById(trackIdRef.current); setHasTrack(true); }
            } catch { /* ignore */ }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            // 1 = playing, 2 = paused, 0 = ended
            if (e.data === 1) setPlaying(true);
            else if (e.data === 2 || e.data === 0) setPlaying(false);
          },
        },
      };
      // videoId UNIQUEMENT s'il est valide (sinon YouTube jette "Invalid video id"
      // et casse l'init → onReady ne se déclenche jamais).
      if (initId) opts.videoId = initId;
      playerRef.current = new YT.Player(hostRef.current, opts);
    })();
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      readyRef.current = false;
      scratchRef.current?.dispose();
      scratchRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- YOUTUBE : charge un nouveau morceau quand la prop change ----
  useEffect(() => {
    if (isAudio) return; // morceau audio → géré par l'effet audio
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (!track?.youtube_video_id) return;
    try {
      if (playingRef.current) p.loadVideoById(track.youtube_video_id);
      else p.cueVideoById(track.youtube_video_id);
      setHasTrack(true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.youtube_video_id]);

  // ---- AUDIO (vrai scratch) : charge le fichier décodé ----
  useEffect(() => {
    if (!isAudio || !track?.audio_url) return;
    // Coupe YouTube s'il jouait sur ce deck.
    try { if (playerRef.current && readyRef.current) playerRef.current.pauseVideo(); } catch { /* ignore */ }
    setPlaying(false);
    if (!audioRef.current) {
      const d = new AudioDeck();
      d.onPos = () => { /* position dispo si besoin UI précise */ };
      audioRef.current = d;
    }
    const deck = audioRef.current;
    deck.setVolume(volumeRef.current);
    deck.load(track.audio_url).then(() => { setHasTrack(true); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.audio_url, isAudio]);

  // ---- Volume (crossfader) → route vers le bon moteur ----
  useEffect(() => {
    if (isAudio) { audioRef.current?.setVolume(volume); return; }
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try { p.setVolume(Math.round(volume * 100)); } catch { /* ignore */ }
  }, [volume, isAudio]);

  // ---- Tempo / pitch ----
  useEffect(() => {
    if (isAudio) { audioRef.current?.setTempo(RATES[rateIdx]); return; }
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try { p.setPlaybackRate(RATES[rateIdx]); } catch { /* ignore */ }
  }, [rateIdx, isAudio]);

  const togglePlay = useCallback(() => {
    if (!hasTrack) return;
    if (isAudio) {
      const d = audioRef.current;
      if (!d) return;
      // init() (re)débloque l'AudioContext dans le geste, puis play/pause.
      d.init().then(() => {
        if (playingRef.current) { d.pause(); setPlaying(false); }
        else { d.play(); setPlaying(true); }
      });
      return;
    }
    const p = playerRef.current;
    if (!p || !readyRef.current || !track?.youtube_video_id) return;
    try {
      if (playingRef.current) p.pauseVideo();
      else p.playVideo();
    } catch { /* ignore */ }
  }, [hasTrack, isAudio, track?.youtube_video_id]);

  // ---- Gestes de scratch sur le vinyle ----
  const angleAt = (clientX: number, clientY: number): number => {
    const el = platterRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2));
  };

  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    if (!hasTrack) { onArm(); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const was = playingRef.current;

    if (isAudioRef.current) {
      // VRAI scratch : on prend la main sur la lecture du buffer.
      const d = audioRef.current;
      d?.init();           // (re)débloque l'AudioContext dans le geste
      d?.scratchStart();
    } else {
      // YOUTUBE : scratch synthé + pause de la lecture (jog au relâcher).
      if (!scratchRef.current) scratchRef.current = new ScratchEngine();
      scratchRef.current.ensure();
      scratchRef.current.start();
      try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
    }
    const base = (() => { try { return playerRef.current?.getCurrentTime?.() ?? 0; } catch { return 0; } })();
    dragRef.current = {
      active: true,
      lastAngle: angleAt(e.clientX, e.clientY),
      lastMoveTs: performance.now(),
      baseTime: base,
      scrubSec: 0,
      wasPlaying: was,
    };
  };

  const onPointerMove = (e: RPE<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const now = performance.now();
    const a = angleAt(e.clientX, e.clientY);
    let delta = a - d.lastAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const dt = Math.max(0.008, (now - d.lastMoveTs) / 1000);
    const angVel = delta / dt; // rad/s signée
    rotRef.current = (rotRef.current + (delta * 180) / Math.PI) % 360;
    d.scrubSec += (delta / (2 * Math.PI)) * SECONDS_PER_TURN;
    d.lastAngle = a;
    d.lastMoveTs = now;

    if (isAudioRef.current) {
      // rate (samples/sample) = secondes d'audio par seconde réelle.
      // (ω/2π) tours/s × SECONDS_PER_TURN s/tour = s audio / s réelle.
      const rate = (angVel / (2 * Math.PI)) * SECONDS_PER_TURN;
      audioRef.current?.scratchMove(rate);
    } else {
      scratchRef.current?.setVelocity(angVel);
    }
  };

  const endDrag = (e: RPE<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    if (isAudioRef.current) {
      // Le playhead a déjà bougé avec le doigt (vrai scratch) → on reprend
      // simplement la lecture (ou on reste figé si c'était à l'arrêt).
      audioRef.current?.scratchEnd();
      return;
    }
    // YOUTUBE : scratch synthé fini → saut à la position scratchée + reprise.
    scratchRef.current?.stop();
    const p = playerRef.current;
    if (p && readyRef.current) {
      const target = Math.max(0, d.baseTime + d.scrubSec);
      try {
        p.seekTo(target, true);
        if (d.wasPlaying) p.playVideo();
      } catch { /* ignore */ }
    }
  };

  return (
    <div className={'flex flex-col items-center gap-2 rounded-2xl p-2.5 border ' + (armed ? 'border-red-400/60 bg-red-500/5' : 'border-white/10 bg-white/[0.03]')}>
      <div className="flex items-center justify-between w-full px-0.5">
        <span className="text-[11px] font-bold text-red-200">Platine {side}</span>
        <button type="button" onClick={onArm} className={'text-[10px] px-2 py-0.5 rounded-full border ' + (armed ? 'border-red-400/60 text-red-100 bg-red-500/20' : 'border-white/15 text-white/50')}>
          {armed ? 'armée' : 'charger ici'}
        </button>
      </div>

      {/* VINYLE — le doigt l'entraîne */}
      <div
        className="relative w-[42vw] max-w-[180px] aspect-square rounded-full overflow-hidden touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Lecteur YouTube : taille réelle, centré, MAIS caché sous le vinyle
            opaque (z au-dessus) et clippé au cercle. Le navigateur le voit
            "visible" → il joue le son ; l'utilisateur ne voit que le disque. */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div ref={hostRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 220, height: 220, transform: 'translate(-50%, -50%)' }} />
        </div>
        <div ref={platterRef} className="absolute inset-0 z-10 rounded-full will-change-transform" style={{ transform: 'rotate(0deg)' }}>
          {/* disque */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,#222_0%,#0a0a0a_60%,#000_100%)] border border-white/10 shadow-inner" />
          {/* sillons */}
          <div className="absolute inset-[10%] rounded-full border border-white/[0.06]" />
          <div className="absolute inset-[22%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[34%] rounded-full border border-white/[0.04]" />
          {/* label central = pochette */}
          <div className="absolute inset-[38%] rounded-full overflow-hidden border-2 border-black bg-red-900/40">
            {track?.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.thumbnail_url} alt="" className="w-full h-full object-cover" draggable={false} />
            )}
          </div>
          {/* repère de rotation (point blanc) */}
          <div className="absolute left-1/2 top-[6%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/80" />
          {/* trou central */}
          <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-black border border-white/30" />
        </div>
      </div>

      <div className="w-full text-center min-h-[28px]">
        <p className="text-[11px] font-semibold text-white/90 line-clamp-1">{track?.title || '—'}</p>
        <p className="text-[10px] text-white/45 line-clamp-1">{track?.artist_name || (hasTrack ? '' : 'tape un son dans la liste')}</p>
      </div>

      {/* PLAY + TEMPO */}
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasTrack}
          className="shrink-0 w-10 h-10 rounded-full bg-red-600 disabled:opacity-30 flex items-center justify-center active:scale-95"
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={RATES.length - 1}
            step={1}
            value={rateIdx}
            onChange={(e) => setRateIdx(parseInt(e.target.value, 10))}
            className="w-full accent-red-500"
            aria-label="Tempo"
          />
          <div className="text-center text-[9px] text-white/40 leading-none mt-0.5">tempo ×{RATES[rateIdx]}</div>
        </div>
      </div>
    </div>
  );
}
