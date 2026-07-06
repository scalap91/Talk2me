'use client';

/**
 * /home/ubuntu/talktome/components/cards/editors/CameraCaptureModal.tsx
 *
 * Talk2Me #421 — modal caméra multi-clips avec compte-à-rebours.
 *
 * Flow :
 *  1. Demande getUserMedia ({ video, audio }) → preview live.
 *  2. User choisit countdown (3/5/10s), front/back, puis tape REC.
 *  3. Overlay 3, 2, 1… → MediaRecorder démarre.
 *  4. PAUSE / RESUME possibles. STOP → blob → upload → onClipReady(url, durationSec).
 *  5. "Reshoot last" = jette le dernier clip enregistré ET reset l'état pour
 *     refaire un take.
 *  6. Plein écran modal mobile-first (portrait).
 *
 * Mime type :
 *  - Préfère 'video/mp4;codecs=avc1' si supporté (iOS Safari).
 *  - Fallback 'video/webm;codecs=vp9,opus' (Chrome/Firefox).
 *  - Fallback final 'video/webm'.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCcw, Pause, Play, Square, Loader2 } from '@/lib/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Appelé quand un clip vient d'être enregistré + uploadé avec succès.
   * `url` : /uploads/<id>.<ext> ; `durationSec` : durée mesurée par
   * MediaRecorder ; `sizeBytes` : taille du blob.
   */
  onClipReady: (url: string, durationSec: number, sizeBytes: number) => void;
}

type Facing = 'user' | 'environment';
type CountdownChoice = 3 | 5 | 10;

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore
    }
  }
  return '';
}

function extFromMime(mime: string): string {
  if (mime.startsWith('video/mp4')) return 'mp4';
  if (mime.startsWith('video/webm')) return 'webm';
  return 'webm';
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close().catch(() => {});
    }, 120);
  } catch {
    // ignore
  }
}

export default function CameraCaptureModal({ open, onClose, onClipReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordAccumMsRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [facing, setFacing] = useState<Facing>('user');
  const [countdown, setCountdown] = useState<CountdownChoice>(3);
  const [countdownTick, setCountdownTick] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaSupported, setMediaSupported] = useState(true);

  /* ----- Stream lifecycle ----- */

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
    }
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (facingMode: Facing) => {
    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setMediaSupported(false);
        setError('Ton navigateur ne supporte pas la caméra.');
        return;
      }
      stopStream();
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.muted = true; // évite l'écho preview
        try {
          await videoRef.current.play();
        } catch {
          // autoplay may be blocked, user gesture suffit
        }
      }
      setError(null);
    } catch (e: any) {
      console.error('[CameraCaptureModal] getUserMedia error', e);
      setError(
        e?.name === 'NotAllowedError'
          ? 'Accès caméra refusé. Autorise dans les réglages.'
          : 'Impossible d\'ouvrir la caméra.'
      );
    }
  }, [stopStream]);

  // Open/close lifecycle
  useEffect(() => {
    if (open) {
      startStream(facing);
    } else {
      stopStream();
      setRecording(false);
      setPaused(false);
      setElapsedMs(0);
      setCountdownTick(null);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const switchFacing = useCallback(async () => {
    if (recording) return;
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    await startStream(next);
  }, [facing, recording, startStream]);

  /* ----- Recording lifecycle ----- */

  const startRecorder = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch (e: any) {
      console.error('[CameraCaptureModal] MediaRecorder error', e);
      setError('Impossible de démarrer l\'enregistrement.');
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = handleRecorderStop;
    recorder.start(250); // chunk every 250ms = more robust against tab kill
    recorderRef.current = recorder;
    recordStartRef.current = Date.now();
    recordAccumMsRef.current = 0;
    setElapsedMs(0);
    setRecording(true);
    setPaused(false);
    beep();
    // Live timer
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      if (!recorderRef.current) return;
      if (recorderRef.current.state === 'recording') {
        const now = Date.now();
        const live = now - recordStartRef.current;
        setElapsedMs(recordAccumMsRef.current + live);
      }
    }, 100);
  }, []);

  const onTapRec = useCallback(() => {
    if (recording) return;
    if (uploading) return;
    if (!streamRef.current) return;
    // Si countdown en cours → cancel
    if (countdownTick !== null) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdownTick(null);
      return;
    }
    // Lance le countdown
    setCountdownTick(countdown);
    let n = countdown;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdownTick(null);
        startRecorder();
      } else {
        setCountdownTick(n);
      }
    }, 1000);
  }, [countdown, recording, uploading, countdownTick, startRecorder]);

  const onTapPause = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === 'recording') {
      r.pause();
      recordAccumMsRef.current += Date.now() - recordStartRef.current;
      setPaused(true);
    } else if (r.state === 'paused') {
      recordStartRef.current = Date.now();
      r.resume();
      setPaused(false);
    }
  }, []);

  const onTapStop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (r.state === 'recording' || r.state === 'paused') {
      if (r.state === 'recording') {
        recordAccumMsRef.current += Date.now() - recordStartRef.current;
      }
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const handleRecorderStop = useCallback(() => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    setRecording(false);
    setPaused(false);
    const durationSec = recordAccumMsRef.current / 1000;
    recordAccumMsRef.current = 0;
    if (chunks.length === 0) {
      setError('Aucune donnée enregistrée.');
      return;
    }
    const mime = recorderRef.current?.mimeType || pickMimeType() || 'video/webm';
    const blob = new Blob(chunks, { type: mime });
    void uploadBlob(blob, durationSec, mime);
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, durationSec: number, mime: string) => {
      setUploading(true);
      setError(null);
      try {
        const ext = extFromMime(mime);
        // Note : /api/upload accepte video/mp4 ou video/webm. Pour webm
        // enregistré côté caméra, on remet le mime sans codec suffix.
        const cleanMime = mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
        const file = new File([blob], `cam_${Date.now()}.${ext}`, { type: cleanMime });
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || `upload_failed (status ${res.status})`);
        }
        onClipReady(json.url as string, durationSec, blob.size);
      } catch (e: any) {
        console.error('[CameraCaptureModal] upload error', e);
        setError(e?.message || 'Upload échoué.');
      } finally {
        setUploading(false);
      }
    },
    [onClipReady]
  );

  const onTapClose = useCallback(() => {
    if (recording) {
      // Stop in-flight recording, then close (no clip emitted on cancel).
      const r = recorderRef.current;
      if (r) {
        // override onstop to skip upload
        r.onstop = () => {
          chunksRef.current = [];
          setRecording(false);
        };
        try { r.stop(); } catch { /* ignore */ }
      }
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setCountdownTick(null);
    onClose();
  }, [recording, onClose]);

  /* ----- Render ----- */

  if (!open) return null;

  const mm = Math.floor(elapsedMs / 60000);
  const ss = Math.floor((elapsedMs / 1000) % 60);
  const elapsedStr = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Caméra"
      className="fixed inset-0 z-[110] bg-black flex flex-col"
      data-testid="camera-capture-modal"
    >
      {/* Top bar : close + countdown picker */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <button
          type="button"
          onClick={onTapClose}
          className="w-9 h-9 rounded-full bg-black/45 backdrop-blur border border-white/15 text-white flex items-center justify-center"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1 bg-black/45 backdrop-blur rounded-full p-1 border border-white/10">
          {([3, 5, 10] as CountdownChoice[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => !recording && setCountdown(n)}
              disabled={recording}
              className={
                'px-3 py-1 rounded-full text-[12px] transition-colors ' +
                (countdown === n
                  ? 'bg-white text-black font-semibold'
                  : 'text-white/85 hover:bg-white/10')
              }
              data-testid={`countdown-${n}`}
              aria-pressed={countdown === n}
            >
              {n}s
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={switchFacing}
          disabled={recording}
          className="w-9 h-9 rounded-full bg-black/45 backdrop-blur border border-white/15 text-white flex items-center justify-center disabled:opacity-40"
          aria-label="Changer de caméra"
          title="Caméra avant/arrière"
        >
          <RefreshCcw className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Preview vidéo */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover bg-black"
          playsInline
          autoPlay
          muted
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {/* Countdown big overlay */}
        {countdownTick !== null && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-live="polite"
          >
            <div
              key={countdownTick}
              className="text-white font-bold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-countdown"
              style={{ fontSize: 'min(40vw, 240px)', lineHeight: 1 }}
              data-testid={`countdown-tick-${countdownTick}`}
            >
              {countdownTick}
            </div>
          </div>
        )}

        {/* Recording timer */}
        {recording && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur"
            data-testid="recording-timer"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${paused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-white text-sm font-mono">{elapsedStr}</span>
            {paused && <span className="text-yellow-200 text-[11px] uppercase">en pause</span>}
          </div>
        )}

        {/* Error banner */}
        {(error || !mediaSupported) && (
          <div className="absolute inset-x-4 top-16 px-3 py-2 rounded-xl bg-red-500/20 border border-red-400/40 text-red-100 text-[12.5px]">
            {error || 'Caméra non supportée.'}
          </div>
        )}

        {/* Uploading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur flex flex-col items-center justify-center gap-2 z-20">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
            <span className="text-white/85 text-sm">Sauvegarde du clip…</span>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-gradient-to-t from-black to-black/60 px-6 pt-4 pb-8 flex items-center justify-around relative z-10">
        {recording ? (
          <>
            <button
              type="button"
              onClick={onTapPause}
              className="w-14 h-14 rounded-full bg-white/15 border border-white/20 text-white flex items-center justify-center"
              aria-label={paused ? 'Reprendre' : 'Pause'}
              data-testid="camera-pause"
            >
              {paused ? <Play className="w-6 h-6 ml-0.5" /> : <Pause className="w-6 h-6" />}
            </button>
            <button
              type="button"
              onClick={onTapStop}
              className="w-20 h-20 rounded-full bg-white border-4 border-white/30 flex items-center justify-center"
              aria-label="Stop"
              data-testid="camera-stop"
            >
              <Square className="w-8 h-8 text-red-600 fill-red-600" />
            </button>
            <div className="w-14" /> {/* spacer */}
          </>
        ) : (
          <>
            <div className="w-14" /> {/* spacer */}
            <button
              type="button"
              onClick={onTapRec}
              disabled={uploading || !mediaSupported}
              className={
                'w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center disabled:opacity-40 ' +
                (countdownTick !== null
                  ? 'bg-yellow-500'
                  : 'bg-red-500 hover:bg-red-600')
              }
              aria-label="Enregistrer"
              data-testid="camera-rec"
            >
              <Camera className="w-8 h-8 text-white" />
            </button>
            <div className="w-14 text-white/60 text-[10px] text-center leading-tight">
              {countdownTick !== null ? 'Tape pour annuler' : `${countdown}s avant`}
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes countdownPop {
          0% { transform: scale(1.4); opacity: 0; }
          15% { transform: scale(1); opacity: 1; }
          85% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.6); opacity: 0; }
        }
        :global(.animate-countdown) {
          animation: countdownPop 1s ease-out;
        }
      `}</style>
    </div>
  );
}
