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
import { Camera, SwitchCamera, X, Square, Circle } from '@/lib/icons';
import LiveComments from '@/components/live/LiveComments';
import LiveProducts from '@/components/live/LiveProducts';
import LiveProductPicker from '@/components/live/LiveProductPicker';
import { startBroadcast } from '@/lib/live/p2p';

type Facing = 'user' | 'environment';

interface Props {
  initialMode: 'photo' | 'video';
  onCapture: (r: { url: string; type: 'image' | 'video' }) => void;
  onCancel: () => void;
  guides?: React.ReactNode;
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

export default function InlineCamera({ initialMode, onCapture, onCancel, guides }: Props) {
  // Mode interne = carrousel Photo/Vidéo (TikTok/Snap). Le flux caméra se ré-init sur changement.
  const [mode, setMode] = useState<'photo' | 'video' | 'live'>(initialMode);
  const [liveOn, setLiveOn] = useState(false); // diffuseur EN DIRECT
  const [liveSecs, setLiveSecs] = useState(0);
  // liveId = mon user id (renvoyé par /api/live/session) → canal commentaires `live:{liveId}`.
  const [liveId, setLiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!liveOn) return;
    const id = setInterval(() => setLiveSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [liveOn]);

  // Cycle de vie de la session live : start → notifie mes amis (push + in-app) et
  // ouvre le canal commentaires ; end → ferme la session. (Pascal 2026-07-04)
  const toggleLive = useCallback(async () => {
    setLiveSecs(0);
    if (liveOn) {
      setLiveOn(false);
      setLiveId(null);
      try {
        await fetch('/api/live/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end' }),
        });
      } catch { /* noop */ }
      return;
    }
    setLiveOn(true);
    try {
      const r = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const j = await r.json();
      if (j?.liveId) setLiveId(j.liveId);
    } catch { /* noop */ }
  }, [liveOn]);

  // Sécurité : si on quitte l'écran EN DIRECT, on ferme la session côté serveur.
  const liveOnRef = useRef(false);
  useEffect(() => { liveOnRef.current = liveOn; }, [liveOn]);
  useEffect(() => () => {
    if (liveOnRef.current) {
      fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      }).catch(() => {});
    }
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<Facing>('user');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // flux caméra réellement attaché ?

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (f: Facing) => {
      setErr(null);
      setReady(false);
      stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErr('Caméra indisponible sur cet appareil.');
          return;
        }
        let s: MediaStream;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: f } },
            audio: mode !== 'photo',
          });
        } catch {
          s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: f } } });
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
          setReady(true);
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

  // DIFFUSION du direct (Pascal 2026-07-05) — quand le vendeur est EN DIRECT, on
  // POUSSE le flux caméra+micro DÉJÀ ouvert (streamRef) vers les spectateurs via
  // l'infra WebRTC P2P existante (startBroadcast, canal `live:{liveId}`). Aucune
  // 2e caméra : on réutilise le MÊME MediaStream que la capture photo/vidéo.
  // Dépend de `facing` : un switch caméra ré-ouvre le flux → on rebranche la diffusion.
  useEffect(() => {
    if (!liveOn || !liveId || !ready) return;
    const stream = streamRef.current;
    if (!stream) return;
    const stopBroadcast = startBroadcast(liveId, stream);
    return () => {
      try { stopBroadcast(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOn, liveId, ready, facing]);

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

  // « Galerie » : attacher une photo DÉJÀ prise (sélecteur natif, sans forcer la caméra).
  const galleryRef = useRef<HTMLInputElement>(null);
  const pickFromGallery = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) upload(f, 'image', (f.name.split('.').pop() || 'jpg').toLowerCase());
      e.target.value = '';
    },
    [upload]
  );

  const takePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Capture la frame BRUTE de la vidéo sur un canvas temporaire → blob → upload.
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
    rec.onerror = () => setErr("Erreur d'enregistrement, réessaie.");
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      if (!blob.size) { setErr("Rien n'a été filmé, réessaie."); return; }
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      void upload(blob, 'video', ext);
    };
    recorderRef.current = rec;
    rec.start(1000); // chunk 1s → flux robuste (évite le blob vide)
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
        autoPlay
        muted
        playsInline
        /* autoPlay + onLoadedMetadata/onPlaying : dans la WebView Android, le play()
           manuel peut échouer/traîner → le flux restait noir. On force l'autoplay et
           on marque « prêt » dès que la vidéo a des données, indépendamment du play(). */
        onLoadedMetadata={() => { setReady(true); videoRef.current?.play().catch(() => {}); }}
        onPlaying={() => setReady(true)}
        className={'absolute inset-0 w-full h-full object-cover bg-black transition-opacity ' + (ready ? 'opacity-100' : 'opacity-0')}
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
      />
      {guides && <div className="absolute inset-0 z-10 pointer-events-none">{guides}</div>}

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
        ) : mode === 'video' ? (
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
        ) : (
          <button
            type="button"
            onClick={() => void toggleLive()}
            aria-label={liveOn ? 'Terminer le direct' : 'Passer en direct'}
            className={'px-7 h-14 rounded-full flex items-center justify-center border-4 border-white/40 text-white font-bold text-[13px] uppercase tracking-[0.1em] active:scale-95 ' + (liveOn ? 'bg-white/15' : 'bg-red-600')}
          >
            {liveOn ? 'Terminer' : '🔴 En direct'}
          </button>
        )}
      </div>

      {busy && (
        <div className="absolute bottom-3 right-3 z-30 text-[11px] text-white/80 bg-black/55 px-2 py-1 rounded-full">
          Envoi…
        </div>
      )}
      {/* Badge EN DIRECT (diffuseur, même vue) — brique 2. */}
      {liveOn && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-red-600 text-white text-[12px] font-bold px-3 py-1 rounded-full shadow-lg" style={{ marginTop: 'env(safe-area-inset-top,0px)' }}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />EN DIRECT · {String(Math.floor(liveSecs / 60)).padStart(2, '0')}:{String(liveSecs % 60).padStart(2, '0')}
        </div>
      )}

      {/* Overlay commentaires temps réel (diffuseur) — TikTok/Insta Live.
          insetBottom laisse la place au bouton « Terminer ». */}
      {mode === 'live' && liveOn && liveId && (
        <LiveComments liveId={liveId} canComment insetBottom={84} />
      )}

      {/* LIVE SHOPPING — le diffuseur épingle un produit (picker) et voit sa card
          épinglée en aperçu (canBuy=false : on ne s'achète pas à soi-même). */}
      {mode === 'live' && liveOn && liveId && (
        <>
          <LiveProductPicker liveId={liveId} />
          <LiveProducts liveId={liveId} canBuy={false} insetBottom={150} />
        </>
      )}

      {/* Carrousel de modes (façon TikTok / Snapchat) — tap Photo · Vidéo.
          Masqué pendant le direct : la place sert au flux de commentaires. */}
      <div className={'absolute bottom-24 inset-x-0 z-30 flex items-center justify-center gap-7 select-none' + (liveOn ? ' hidden' : '')}>
        {(['photo', 'video', 'live'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { if (!recording && !liveOn) setMode(m); }}
            disabled={(recording || liveOn) && mode !== m}
            className={'text-[13px] font-bold uppercase tracking-[0.12em] transition-all active:scale-95 ' + (mode === m ? (m === 'live' ? 'text-red-500 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]' : 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]') : 'text-white/45')}
          >
            {m === 'photo' ? 'Photo' : m === 'video' ? 'Vidéo' : 'Live'}
          </button>
        ))}
        {/* 3ᵉ option : attacher une photo déjà prise (galerie) — même ligne. */}
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={recording || busy}
          className="text-[13px] font-bold uppercase tracking-[0.12em] transition-all active:scale-95 text-white/45 disabled:opacity-40"
        >
          Galerie
        </button>
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pickFromGallery} />
      </div>
    </div>
  );
}
