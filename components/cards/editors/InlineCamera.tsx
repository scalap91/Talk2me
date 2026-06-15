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
import dynamic from 'next/dynamic';
import { Camera, Video as VideoIcon, SwitchCamera, X, Square, Circle, Grid3x3 } from 'lucide-react';

// Léa posée AU MILIEU de ton espace réel (par-dessus la caméra) — chargée à la demande.
const LeaInSpace = dynamic(() => import('@/components/avatar/LeaInSpace'), { ssr: false });
import DevOnly from '@/components/system/DevOnly';

type Facing = 'user' | 'environment';

interface Props {
  mode: 'photo' | 'video';
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

export default function InlineCamera({ mode, onCapture, onCancel, guides }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<Facing>('user');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // flux caméra réellement attaché ?
  const [scan, setScan] = useState(false);   // quadrillage profondeur (GPU)
  const [scanInfo, setScanInfo] = useState('');
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [avatar, setAvatar] = useState(false); // affiche LA pièce 3D (Léa dedans), sur la même page

  // Quadrillage des volumes : capture une frame → /api/depth (Depth Anything GPU)
  // → dessine une grille colorée par la profondeur réelle (proche=chaud, loin=froid).
  useEffect(() => {
    if (!scan || !ready) { overlayRef.current?.getContext('2d')?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height); return; }
    let alive = true;
    const off = document.createElement('canvas');
    const drawGrid = (depthB64: string) => new Promise<void>((resolve) => {
      const v = videoRef.current, ov = overlayRef.current; if (!v || !ov) return resolve();
      const img = new Image();
      img.onload = () => {
        const W = v.clientWidth, H = v.clientHeight; ov.width = W; ov.height = H;
        const ctx = ov.getContext('2d'); if (!ctx) return resolve();
        const dc = document.createElement('canvas'); dc.width = img.width; dc.height = img.height;
        const dctx = dc.getContext('2d'); if (!dctx) return resolve();
        dctx.drawImage(img, 0, 0);
        const px = dctx.getImageData(0, 0, img.width, img.height).data;
        const cols = 26, rows = Math.max(8, Math.round(26 * H / Math.max(1, W)));
        const cw = W / cols, ch = H / rows;
        ctx.clearRect(0, 0, W, H);
        for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
          const sx = Math.min(img.width - 1, Math.floor((gx + 0.5) / cols * img.width));
          const sy = Math.min(img.height - 1, Math.floor((gy + 0.5) / rows * img.height));
          const d = px[(sy * img.width + sx) * 4] / 255; // 1=proche, 0=loin
          const r = Math.round(255 * d), b = Math.round(255 * (1 - d)), g = Math.round(160 * (1 - Math.abs(d - 0.5) * 2));
          ctx.fillStyle = `rgba(${r},${g},${b},0.34)`;
          ctx.fillRect(gx * cw, gy * ch, cw + 1, ch + 1);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1;
        for (let gx = 0; gx <= cols; gx++) { ctx.beginPath(); ctx.moveTo(gx * cw, 0); ctx.lineTo(gx * cw, H); ctx.stroke(); }
        for (let gy = 0; gy <= rows; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * ch); ctx.lineTo(W, gy * ch); ctx.stroke(); }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = 'data:image/png;base64,' + depthB64;
    });
    (async () => {
      setScanInfo('Analyse de l’espace…');
      while (alive) {
        const v = videoRef.current;
        if (v && v.videoWidth) {
          const sw = 384, sh = Math.round(384 * v.videoHeight / v.videoWidth);
          off.width = sw; off.height = sh;
          const octx = off.getContext('2d');
          if (octx) {
            octx.drawImage(v, 0, 0, sw, sh);
            const b64 = off.toDataURL('image/jpeg', 0.7).split(',')[1];
            try {
              const res = await fetch('/api/depth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: b64 }) });
              const j = await res.json();
              if (alive && j.depth_b64) { await drawGrid(j.depth_b64); setScanInfo('Volumes détectés ✓'); }
              else if (alive) setScanInfo('GPU: ' + (j.error || 'indispo'));
            } catch { if (alive) setScanInfo('réseau…'); }
          }
        }
        await new Promise((r) => setTimeout(r, 1400));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, ready]);

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
            audio: mode === 'video',
          });
        } catch {
          // Micro refusé/absent → on RETENTE sans audio pour filmer quand même.
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
        muted
        playsInline
        /* poster transparent : empêche le WebView Android d'afficher son
           placeholder vidéo par défaut (triangle « play » parasite) quand le
           flux caméra n'est pas encore attaché. */
        className={'absolute inset-0 w-full h-full object-cover bg-black transition-opacity ' + (ready ? 'opacity-100' : 'opacity-0')}
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
      />
      {/* overlay quadrillage profondeur (par-dessus le flux) */}
      <canvas ref={overlayRef} className={'absolute inset-0 w-full h-full pointer-events-none z-[12] transition-opacity ' + (scan ? 'opacity-100' : 'opacity-0')} />
      {guides && <div className="absolute inset-0 z-10 pointer-events-none">{guides}</div>}

      {/* Bouton Avatar → Léa posée AU MILIEU de ton espace réel (sur le flux caméra) */}
      {avatar && <DevOnly><LeaInSpace /></DevOnly>}

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

      {/* Quadriller l'espace (profondeur GPU) */}
      <button
        type="button"
        onClick={() => setScan((s) => !s)}
        aria-label="Quadriller l'espace"
        className={'absolute top-12 right-2 z-30 w-9 h-9 rounded-full backdrop-blur flex items-center justify-center ' + (scan ? 'bg-[#8b5cff] text-white' : 'bg-black/55 text-white')}
      >
        <Grid3x3 className="w-4 h-4" />
      </button>

      {/* Bouton avatar Léa — masqué sur beta (pas au point), visible dev pour recherche */}
      <DevOnly>
        <button
          type="button"
          onClick={() => setAvatar((a) => !a)}
          aria-label={avatar ? 'Cacher Léa' : 'Faire apparaître Léa'}
          className={'absolute top-[5.5rem] right-2 z-30 px-2.5 h-9 rounded-full text-[12px] font-semibold backdrop-blur flex items-center gap-1 ' + (avatar ? 'bg-[#8b5cff] text-white' : 'bg-white text-black')}
        >
          🧍 {avatar ? 'Léa ✓' : 'Avatar'}
        </button>
      </DevOnly>
      {scan && (
        <div className="absolute top-12 left-2 z-30 text-[11px] text-white bg-black/55 px-2 py-1 rounded-full">
          {scanInfo || 'scan…'}
        </div>
      )}

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
