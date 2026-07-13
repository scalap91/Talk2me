'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Recadreur d'avatar (Pascal 2026-06-16) : on glisse/zoome la photo dans un
 * cercle, on valide → image carrée 512×512 bien cadrée (uploadée telle quelle,
 * donc correcte PARTOUT, pas besoin de position par écran). Tactile + souris.
 */
import { useEffect, useRef, useState } from 'react';

const FRAME = 288; // taille du cadre à l'écran (px)
const OUT = 512;   // taille de sortie

export default function AvatarCropper({ file, onCancel, onCropped }: { file: File; onCancel: () => void; onCropped: (blob: Blob) => void }) {
  const [url, setUrl] = useState<string>('');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // scale de base = "cover" (l'image remplit le cadre), puis × zoom.
  const baseScale = nat ? Math.max(FRAME / nat.w, FRAME / nat.h) : 1;
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : FRAME;
  const dispH = nat ? nat.h * scale : FRAME;

  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(FRAME - dispW, x)),
    y: Math.min(0, Math.max(FRAME - dispH, y)),
  });

  useEffect(() => { setOff((o) => clamp(o.x, o.y)); /* re-clamp au zoom */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, nat]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.x);
    const ny = drag.current.oy + (e.clientY - drag.current.y);
    setOff(clamp(nx, ny));
  };
  const onUp = () => { drag.current = null; };

  const validate = async () => {
    if (!nat || !imgRef.current) return;
    setBusy(true);
    try {
      const r = OUT / FRAME;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(imgRef.current, off.x * r, off.y * r, dispW * r, dispH * r);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
      if (blob) onCropped(blob);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[var(--t2m-paper)] rounded-3xl border border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[var(--t2m-ink)] text-[16px] font-bold mb-1">Recadrer la photo</h3>
        <p className="text-[var(--t2m-ink-3)] text-[12px] mb-3">Glisse pour déplacer, le curseur pour zoomer.</p>
        <div
          className="relative mx-auto overflow-hidden rounded-full border border-[var(--t2m-line)] touch-none select-none bg-black"
          style={{ width: FRAME, height: FRAME, cursor: 'grab' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          {url && (
            <img
              ref={imgRef} src={url} alt="" draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ position: 'absolute', left: off.x, top: off.y, width: dispW, height: dispH, maxWidth: 'none' }}
            />
          )}
        </div>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full mt-4 accent-[var(--t2m-primary)]" />
        <div className="flex gap-2.5 mt-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[14px] font-medium">Annuler</button>
          <button type="button" onClick={validate} disabled={busy || !nat} className="flex-1 py-3 rounded-xl bg-[var(--t2m-primary)] text-white text-[14px] font-bold disabled:opacity-50">{busy ? '…' : 'Valider'}</button>
        </div>
      </div>
    </div>
  );
}
