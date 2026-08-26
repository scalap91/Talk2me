'use client';
/**
 * PinchCrop — recadrage PINCEMENT-ZOOM façon NATIF (Flutter InteractiveViewer).
 * Remplace l'éditeur Filerobot (lourd, hors-charte). Un seul geste : pincer pour
 * zoomer, glisser pour cadrer. Cadre 9:16 (feed immersif). « Valider » cuit le
 * cadre visible dans un <canvas> → dataURL JPEG → onDone.
 *
 * ANTI-BANDES-NOIRES (doctrine Pascal) : le scale est clampé à ≥ cover et le pan
 * est borné → l'image remplit TOUJOURS le cadre, aucune zone vide ne peut être cuite.
 * Parité native : lib/main.dart _review() (InteractiveViewer, RRepaintBoundary).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, Loader2 } from '@/lib/icons';

const RATIO = 9 / 16; // largeur / hauteur du cadre (format feed vertical)
const OUT_W = 1080;   // sortie cuite (qualité, ~2×)
const OUT_H = 1920;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function PinchCrop({
  src,
  onDone,
  onCancel,
}: {
  src: string;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [dispW0, setDispW0] = useState(0); // taille « cover » de l'image dans le cadre à scale=1
  const [dispH0, setDispH0] = useState(0);
  const [scale, setScale] = useState(1);
  const [px, setPx] = useState(0); // translation top-left (origin 0 0)
  const [py, setPy] = useState(0);
  const [baking, setBaking] = useState(false);

  // Cadre 9:16 borné à la largeur écran (max-w-md) et à la hauteur dispo.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const compute = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      let fw = availW;
      let fh = fw / RATIO;
      if (fh > availH) { fh = availH; fw = fh * RATIO; }
      setFrame({ w: fw, h: fh });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // Cover initial : image remplit le cadre, centrée, scale=1.
  useEffect(() => {
    if (!nat || !frame.w || !frame.h) return;
    const coverW = Math.max(frame.w, frame.h * (nat.w / nat.h));
    const coverH = coverW * (nat.h / nat.w);
    setDispW0(coverW);
    setDispH0(coverH);
    setScale(1);
    setPx((frame.w - coverW) / 2);
    setPy((frame.h - coverH) / 2);
  }, [nat, frame.w, frame.h]);

  // Borne le pan pour que l'image couvre TOUJOURS le cadre (aucune bande noire).
  const clampPan = useCallback(
    (nx: number, ny: number, s: number) => {
      const w = dispW0 * s, h = dispH0 * s;
      return {
        x: clamp(nx, frame.w - w, 0),
        y: clamp(ny, frame.h - h, 0),
      };
    },
    [dispW0, dispH0, frame.w, frame.h],
  );

  // Zoom autour d'un point (cx,cy) du cadre.
  const zoomAround = useCallback(
    (cx: number, cy: number, factor: number) => {
      setScale((prev) => {
        const next = clamp(prev * factor, 1, 6);
        const f = next / prev;
        setPx((ppx) => {
          const nx = cx - (cx - ppx) * f;
          setPy((ppy) => clampPan(nx, cy - (cy - ppy) * f, next).y);
          return clampPan(nx, 0, next).x;
        });
        return next;
      });
    },
    [clampPan],
  );

  // Gestes tactiles / souris.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchPrev = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      // pan
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      setPx((ppx) => {
        setPy((ppy) => clampPan(ppx + dx, ppy + dy, scale).y);
        return clampPan(ppx + dx, 0, scale).x;
      });
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = frameRef.current?.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - (rect?.left ?? 0);
      const cy = (a.y + b.y) / 2 - (rect?.top ?? 0);
      if (pinchPrev.current && pinchPrev.current.dist > 0) {
        zoomAround(cx, cy, dist / pinchPrev.current.dist);
      }
      pinchPrev.current = { dist, cx, cy };
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchPrev.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    zoomAround(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), Math.exp(-e.deltaY * 0.0015));
  };

  // Cuisson : mappe le cadre visible → pixels source → canvas 9:16.
  const bake = () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBaking(true);
    try {
      const cnv = document.createElement('canvas');
      cnv.width = OUT_W; cnv.height = OUT_H;
      const ctx = cnv.getContext('2d');
      if (!ctx) { setBaking(false); onDone(src); return; }
      // (fx,fy) cadre → (u,v) coord intrinsèque image (cover) → source natif.
      const u0 = (0 - px) / scale;
      const v0 = (0 - py) / scale;
      const uw = frame.w / scale;
      const vh = frame.h / scale;
      const kx = nat.w / dispW0, ky = nat.h / dispH0;
      ctx.drawImage(img, u0 * kx, v0 * ky, uw * kx, vh * ky, 0, 0, OUT_W, OUT_H);
      onDone(cnv.toDataURL('image/jpeg', 0.92));
    } catch {
      onDone(src);
    } finally {
      setBaking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Zone image (cadre 9:16 centré) */}
      <div ref={frameRef} className="relative flex-1 min-h-0 overflow-hidden touch-none flex items-center justify-center">
        <div
          className="relative overflow-hidden"
          style={{ width: frame.w, height: frame.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute select-none pointer-events-none"
            style={{
              width: dispW0 || undefined,
              height: dispH0 || undefined,
              transformOrigin: '0 0',
              transform: `translate(${px}px, ${py}px) scale(${scale})`,
              willChange: 'transform',
            }}
          />
          {/* cadre repère (fin) */}
          <div className="absolute inset-0 pointer-events-none ring-1 ring-white/15" />
        </div>
        {/* aide */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none text-white/70 text-[12px] font-medium bg-black/40 px-3 py-1.5 rounded-full">
          Pince pour zoomer · glisse pour cadrer
        </div>
      </div>

      {/* Barre du bas : Annuler / Valider */}
      <div
        className="shrink-0 flex items-center justify-between px-4 gap-3"
        style={{ paddingTop: '0.75rem', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={baking}
          className="w-11 h-11 rounded-full bg-white/15 grid place-items-center text-white active:scale-95"
          aria-label="Annuler"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={bake}
          disabled={baking || !nat}
          className="flex-1 h-12 rounded-2xl inline-flex items-center justify-center gap-2 text-white text-[15px] font-extrabold active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: '#FF7F11' }}
        >
          {baking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {baking ? 'Traitement…' : 'Valider'}
        </button>
      </div>
    </div>
  );
}
