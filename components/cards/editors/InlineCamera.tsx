'use client';

/**
 * Talk2Me #429 — InlineCamera : capture DANS le composer (pas de page séparée).
 * Pascal : "on n'est pas TikTok, on est un Hub → on impose nos containers".
 * Caméra live embarquée dans la zone média du gabarit : on cadre, on capture
 * (photo OU vidéo), ça revient dans le composer. L'éditeur d'effets est une
 * étape optionnelle ensuite.
 *
 * (Néon de cadrage/éclairage + multi-clips = itérations suivantes.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Video as VideoIcon, SwitchCamera, X, Square, Circle } from 'lucide-react';

type Facing = 'user' | 'environment';

interface Props {
  mode: 'photo' | 'video';
  onCapture: (r: { url: string; type: 'image' | 'video' }) => void;
  onCancel: () => void;
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* noop */
    }
  }
  return '';
}

export default function InlineCamera({ mode, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<Facing>('user');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (f: Facing) => {
      setErr(null);
      stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErr('Caméra indisponible sur cet appareil.');
          return;
        }
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: f } },
          audio: mode === 'video',
        });
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setErr("Autorise la caméra pour filmer/prendre une photo.");
      }
    },
    [mode, stop]
  );

  useEffect(() => {
    start(facing);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const upload = useCallback(
    async (blob: Blob, type: 'image' | 'video', ext: string) => {
      setBusy(true);
      try {
        const file = new File([blob], `cam_${Date.now()}.${ext}`, { type: blob.type });
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok || !j?.url) throw new Error(j?.error || 'upload');
        stop();
        onCapture({ url: j.url as string, type });
      } catch {
        setErr("Échec de l'envoi du média.");
      } finally {
        setBusy(false);
      }
    },
    [onCapture, stop]
  );

  const takePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) void upload(blob, 'image', 'jpg');
      },
      'image/jpeg',
      0.92
    );
  }, [upload]);

  const startRec = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    const mime = pickMime();
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      setErr('Enregistrement non supporté.');
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      void upload(blob, 'video', ext);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  }, [upload]);

  const stopRec = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    setRecording(false);
  }, []);

  return (
    <div className="absolute inset-0 z-20 bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
      />

      {err && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <span className="text-[13px] text-white/85">{err}</span>
        </div>
      )}

      {/* Fermer */}
      <button
        type="button"
        onClick={() => {
          stop();
          onCancel();
        }}
        aria-label="Annuler"
        className="absolute top-2 left-2 z-30 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Switch caméra */}
      <button
        type="button"
        onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
        aria-label="Changer de caméra"
        className="absolute top-2 right-2 z-30 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white"
      >
        <SwitchCamera className="w-4 h-4" />
      </button>

      {/* Déclencheur */}
      <div className="absolute bottom-3 inset-x-0 z-30 flex items-center justify-center">
        {mode === 'photo' ? (
          <button
            type="button"
            onClick={takePhoto}
            disabled={busy}
            aria-label="Prendre la photo"
            className="w-16 h-16 rounded-full bg-white border-4 border-white/40 flex items-center justify-center disabled:opacity-50"
          >
            <Camera className="w-6 h-6 text-black" />
          </button>
        ) : (
          <button
            type="button"
            onClick={recording ? stopRec : startRec}
            disabled={busy}
            aria-label={recording ? 'Arrêter' : 'Filmer'}
            className={
              'w-16 h-16 rounded-full flex items-center justify-center border-4 disabled:opacity-50 ' +
              (recording ? 'bg-red-600 border-red-300/50' : 'bg-red-500 border-white/40')
            }
          >
            {recording ? <Square className="w-6 h-6 text-white fill-current" /> : <Circle className="w-6 h-6 text-white fill-current" />}
          </button>
        )}
      </div>

      {busy && (
        <div className="absolute bottom-3 right-3 z-30 text-[11px] text-white/80 bg-black/55 px-2 py-1 rounded-full">
          Envoi…
        </div>
      )}
      {/* indicateur mode */}
      <div className="absolute bottom-4 left-3 z-30 text-[11px] text-white/80 bg-black/45 px-2 py-1 rounded-full flex items-center gap-1">
        {mode === 'photo' ? <Camera className="w-3 h-3" /> : <VideoIcon className="w-3 h-3" />}
        {mode === 'photo' ? 'Photo' : 'Vidéo'}
      </div>
    </div>
  );
}
