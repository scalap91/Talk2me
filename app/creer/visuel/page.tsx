'use client';

/**
 * Décorateur de cards visuelles (web) — RÉPLIQUE EXACTE du décorateur NATIF
 * (talk2me-flutter/lib/main.dart → _PhotoDecoratorScreenState). Thème SOMBRE, mêmes
 * étapes, mêmes outils, même look : zéro divergence web↔natif. Le natif = la vérité.
 * Moteur de rendu/export = Fabric.js v7 (toDataURL fiable), habillage 100% aligné natif.
 * Isolé sur /creer/visuel, zéro impact sur le reste. (Pascal — réunification web/natif.)
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Undo2, Redo2, Plus, Minus, Trash2, Type, ImageIcon,
  Square, Circle as CircleIcon, Loader2, ChevronDown, ChevronUp,
  Bookmark, Share2,
} from '@/lib/icons';

// Fabric v7 (module chargé dynamiquement, client-only).
type FabricMod = typeof import('fabric');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FCanvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FObject = any;

const ACCENT = '#FF7F11'; // orange accent (natif kAccent)

// Palettes — MÊMES hex, MÊME ordre que le natif (_palette / _bgPalette).
const PALETTE = ['#FFFFFF', '#000000', '#FF7F11', '#7C5CFF', '#EC4899', '#22B573', '#2563EB', '#F59E0B', '#EF4444'];
const BG_PALETTE = ['#7C5CFF', '#111318', '#FF7F11', '#EC4899', '#0D9488', '#2563EB', '#1F2937'];

// Filtres photo — MÊMES réglages CSS que le web (ImageCardEditor.FILTER_CSS).
type FilterKind = 'none' | 'auto' | 'bright' | 'warm' | 'cold' | 'soft';
const FILTER_CSS: Record<FilterKind, string> = {
  none: 'none',
  auto: 'contrast(1.08) saturate(1.12) brightness(1.04)',
  bright: 'brightness(1.15) saturate(1.08)',
  warm: 'sepia(0.18) saturate(1.18) hue-rotate(-8deg) brightness(1.05)',
  cold: 'saturate(1.08) hue-rotate(8deg) brightness(0.98) contrast(1.05)',
  soft: 'contrast(0.95) brightness(1.05) saturate(0.95) blur(0.2px)',
};
// Ordre + libellés natifs : Aucun/Auto/Vif/Chaud/Froid/Doux.
const FILTERS: [FilterKind, string][] = [
  ['none', 'Aucun'], ['auto', 'Auto'], ['bright', 'Vif'],
  ['warm', 'Chaud'], ['cold', 'Froid'], ['soft', 'Doux'],
];

const DEFAULT_BG = '#7C5CFF'; // fond violet par défaut (natif _bg)

type Snap = { json: string; bgColor: string; bgPhoto: string | null; filter: FilterKind };

export default function VisuelPage() {
  const router = useRouter();
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabRef = useRef<FabricMod | null>(null);
  const cvRef = useRef<FCanvas>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Miroirs impératifs (évite les closures périmées dans Fabric).
  const bgColorRef = useRef<string>(DEFAULT_BG);
  const bgPhotoRef = useRef<string | null>(null);
  const filterRef = useRef<FilterKind>('none');
  const bgImgElRef = useRef<HTMLImageElement | null>(null);
  const histRef = useRef<Snap[]>([]);
  const idxRef = useRef<number>(-1);
  const restoringRef = useRef<boolean>(false);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const [selFill, setSelFill] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG);
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>('none');
  const [caption, setCaption] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); };
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ── Style de sélection : cadre blanc 1.2px, coins ronds (proche natif) ─────
  const styleObj = (o: FObject) => o.set({
    borderColor: '#FFFFFF', cornerColor: '#FFFFFF', cornerStrokeColor: '#111114',
    transparentCorners: false, cornerStyle: 'circle', cornerSize: 10, borderScaleFactor: 1.2, padding: 4,
  });

  // ── Historique Undo/Redo (pile d'états Fabric JSON + fond) ─────────────────
  const snapshot = (): Snap => {
    const cv = cvRef.current;
    const j = cv.toJSON();
    delete j.backgroundImage; // le fond photo est géré à part (data-url volumineux)
    return { json: JSON.stringify(j), bgColor: bgColorRef.current, bgPhoto: bgPhotoRef.current, filter: filterRef.current };
  };
  const syncHistFlags = () => {
    setCanUndo(idxRef.current > 0);
    setCanRedo(idxRef.current < histRef.current.length - 1);
  };
  // Enregistre l'état APRÈS chaque mutation ; toute nouvelle mutation invalide le Redo.
  const pushHistory = () => {
    if (restoringRef.current) return;
    histRef.current = histRef.current.slice(0, idxRef.current + 1);
    histRef.current.push(snapshot());
    idxRef.current = histRef.current.length - 1;
    syncHistFlags();
  };
  const restore = async (s: Snap) => {
    const cv = cvRef.current;
    restoringRef.current = true;
    await cv.loadFromJSON(s.json);
    cv.getObjects().forEach(styleObj);
    cv.discardActiveObject();
    bgColorRef.current = s.bgColor; setBgColor(s.bgColor);
    bgPhotoRef.current = s.bgPhoto; setBgPhoto(s.bgPhoto);
    filterRef.current = s.filter; setFilter(s.filter);
    await applyBackground();
    setHasSel(false); setSelFill(null);
    cv.requestRenderAll();
    restoringRef.current = false;
  };
  const undo = async () => { if (idxRef.current <= 0) return; idxRef.current -= 1; await restore(histRef.current[idxRef.current]); syncHistFlags(); };
  const redo = async () => { if (idxRef.current >= histRef.current.length - 1) return; idxRef.current += 1; await restore(histRef.current[idxRef.current]); syncHistFlags(); };

  // ── Fond : couleur _bg OU photo filtrée (filtre CSS rasterisé) ─────────────
  const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) => {
    const ir = img.width / img.height, cr = W / H;
    let dw: number, dh: number;
    if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };
  const applyBackground = async () => {
    const cv = cvRef.current, fabric = fabRef.current;
    if (!cv || !fabric) return;
    if (bgPhotoRef.current && bgImgElRef.current) {
      try {
        const off = document.createElement('canvas');
        off.width = cv.width; off.height = cv.height;
        const ctx = off.getContext('2d');
        if (!ctx) throw new Error('ctx');
        const css = FILTER_CSS[filterRef.current];
        ctx.filter = css === 'none' ? 'none' : css;
        drawCover(ctx, bgImgElRef.current, cv.width, cv.height);
        const bgImg = await fabric.FabricImage.fromURL(off.toDataURL('image/png'));
        bgImg.set({ left: 0, top: 0, selectable: false, evented: false });
        bgImg.scaleX = cv.width / bgImg.width; bgImg.scaleY = cv.height / bgImg.height;
        cv.backgroundImage = bgImg; cv.backgroundColor = '';
      } catch {
        cv.backgroundImage = null; cv.backgroundColor = bgColorRef.current;
      }
    } else {
      cv.backgroundImage = null; cv.backgroundColor = bgColorRef.current;
    }
    cv.requestRenderAll();
  };

  // ── Init Fabric ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cv: FCanvas;
    (async () => {
      const fabric = await import('fabric');
      fabRef.current = fabric;
      // Canvas 4:5 qui tient entre header et barre de contrôles.
      const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const maxW = Math.min(vw - 20, 460);
      const maxH = vh * 0.58;
      let w = maxW, h = (w * 5) / 4;
      if (h > maxH) { h = maxH; w = (h * 4) / 5; }
      w = Math.round(w); h = Math.round(h);
      cv = new fabric.Canvas(canvasEl.current!, { width: w, height: h, backgroundColor: DEFAULT_BG, preserveObjectStacking: true });
      cvRef.current = cv;

      const syncSel = () => {
        const a = cv.getActiveObject();
        if (!a) { setHasSel(false); setSelFill(null); return; }
        setHasSel(true);
        const f = a.get('fill');
        setSelFill(typeof f === 'string' ? f : null);
      };
      cv.on('selection:created', syncSel);
      cv.on('selection:updated', syncSel);
      cv.on('selection:cleared', () => { setHasSel(false); setSelFill(null); });
      cv.on('object:modified', () => { syncSel(); pushHistory(); });

      // Fond photo optionnel (parité natif backgroundUrl) via ?bg=<url d'upload>.
      const bgParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('bg') : null;
      if (bgParam) {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = async () => {
          bgImgElRef.current = el;
          bgPhotoRef.current = bgParam; setBgPhoto(bgParam);
          await applyBackground();
        };
        el.src = bgParam;
      }

      setReady(true);
      // Snapshot de base (état vierge) → 1er undo revient au vide.
      histRef.current = [snapshot()];
      idxRef.current = 0;
      syncHistFlags();
    })();
    return () => { try { cv?.dispose(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Outils : Texte / Photo / Forme / Cercle ────────────────────────────────
  const addText = () => {
    const fabric = fabRef.current!, cv = cvRef.current;
    const t = new fabric.Textbox('Ton texte', {
      left: cv.width * 0.12, top: cv.height * 0.18, width: cv.width * 0.7,
      fontSize: Math.round(cv.width * 0.1), fill: '#FFFFFF', fontWeight: '800',
      fontFamily: "'Outfit','Inter',sans-serif", textAlign: 'center',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.45)', blur: 6, offsetX: 0, offsetY: 0 }),
    });
    styleObj(t); cv.add(t); cv.setActiveObject(t); cv.requestRenderAll(); pushHistory();
  };
  const addShape = (kind: 'rect' | 'circle') => {
    const fabric = fabRef.current!, cv = cvRef.current;
    const o = kind === 'rect'
      ? new fabric.Rect({ left: cv.width * 0.22, top: cv.height * 0.36, width: cv.width * 0.42, height: cv.width * 0.25, fill: 'rgba(255,127,17,0.85)', rx: 10, ry: 10 })
      : new fabric.Circle({ left: cv.width * 0.28, top: cv.height * 0.34, radius: cv.width * 0.18, fill: 'rgba(255,127,17,0.85)' });
    styleObj(o); cv.add(o); cv.setActiveObject(o); cv.requestRenderAll(); pushHistory();
  };
  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const fabric = fabRef.current!, cv = cvRef.current;
      const img = await fabric.FabricImage.fromURL(String(reader.result));
      img.scaleToWidth(cv.width * 0.55);
      img.set({ left: cv.width * 0.2, top: cv.height * 0.4 });
      styleObj(img); cv.add(img); cv.setActiveObject(img); cv.requestRenderAll(); pushHistory();
    };
    reader.readAsDataURL(f);
  };

  // ── Actions sur la sélection : ± taille / z-order / suppression ────────────
  const resize = (dir: 1 | -1) => {
    const cv = cvRef.current, a = cv.getActiveObject();
    if (!a) return;
    const factor = dir > 0 ? 1.12 : 1 / 1.12;
    const w = a.getScaledWidth() * factor;
    if (w < 16 || w > cv.width * 2) return; // borné (natif clamp 12→130)
    a.scaleX *= factor; a.scaleY *= factor; a.setCoords();
    cv.requestRenderAll(); pushHistory();
  };
  const sendBackward = () => { const cv = cvRef.current, a = cv.getActiveObject(); if (!a) return; cv.sendObjectBackwards(a); cv.requestRenderAll(); pushHistory(); };
  const bringForward = () => { const cv = cvRef.current, a = cv.getActiveObject(); if (!a) return; cv.bringObjectForward(a); cv.requestRenderAll(); pushHistory(); };
  const delSel = () => { const cv = cvRef.current, a = cv.getActiveObject(); if (!a) return; cv.remove(a); cv.discardActiveObject(); cv.requestRenderAll(); pushHistory(); };

  // ── Bande couleurs : applique au sélectionné, sinon au fond ────────────────
  const applyColor = (col: string) => {
    const cv = cvRef.current, a = cv.getActiveObject();
    if (a) { a.set('fill', col); setSelFill(col); cv.requestRenderAll(); pushHistory(); }
    else { bgColorRef.current = col; setBgColor(col); applyBackground(); pushHistory(); }
  };

  // ── Filtres (uniquement si photo de fond) ──────────────────────────────────
  const applyFilter = async (k: FilterKind) => {
    if (filterRef.current === k) return;
    filterRef.current = k; setFilter(k);
    await applyBackground(); pushHistory();
  };

  // ── Publier : rasterise le canvas → upload → crée une card image ───────────
  const valider = async () => {
    if (saving || !cvRef.current) return;
    setSaving(true);
    try {
      const cv = cvRef.current;
      cv.discardActiveObject(); cv.requestRenderAll();
      const dataUrl = cv.toDataURL({ format: 'png', multiplier: 2, enableRetinaScaling: false });
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData(); fd.append('file', new File([blob], 'visuel.png', { type: 'image/png' }));
      const up = await (await fetch('/api/upload', { method: 'POST', body: fd })).json().catch(() => ({}));
      if (!up?.url) throw new Error('upload');
      const r = await fetch('/api/cards/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'image', media_url: up.url, caption: caption.trim() }),
      });
      const d = await r.json().catch(() => null);
      router.push(d?.card?.id ? `/home#card-${d.card.id}` : '/home');
    } catch { alert('Échec de la publication du visuel. Réessaie.'); setSaving(false); }
  };

  const palette = hasSel || bgPhoto ? PALETTE : BG_PALETTE;
  const activeColor = (hasSel ? selFill : bgColor)?.toLowerCase() ?? '';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* ── Header : ✕ · Décorer · Undo · Redo · Publier ─────────────────── */}
      <header className="flex items-center px-1.5 py-1" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 4px)' }}>
        <button type="button" onClick={() => router.back()} className="w-11 h-11 flex items-center justify-center text-white active:scale-95" aria-label="Fermer">
          <X size={24} />
        </button>
        <div className="flex-1 text-center text-[17px] font-extrabold text-white" style={{ fontFamily: "'Outfit','Inter',sans-serif" }}>Décorer</div>
        <button type="button" onClick={undo} disabled={!canUndo} className={`w-11 h-11 flex items-center justify-center ${canUndo ? 'text-white' : 'text-white/25'}`} aria-label="Annuler">
          <Undo2 size={22} />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} className={`w-11 h-11 flex items-center justify-center ${canRedo ? 'text-white' : 'text-white/25'}`} aria-label="Rétablir">
          <Redo2 size={22} />
        </button>
        {/* Publier descend dans la rangée de 3 boutons en bas (Brouillon · Publier au feed · Exporter), comme le natif. */}
      </header>

      {/* ── Canvas : centré, 4:5, arrondi 14 ─────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2.5 overflow-hidden">
        <div className="overflow-hidden" style={{ borderRadius: 14, backgroundColor: bgPhoto ? undefined : bgColor }}>
          <canvas ref={canvasEl} />
        </div>
      </div>

      {/* ── Barre de contrôles (bas, #111114) ────────────────────────────── */}
      <div className="px-3 pt-2.5" style={{ backgroundColor: '#111114', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 12px)' }}>
        {/* 1. Rangée sélection : − + reculer avancer … supprimer */}
        {hasSel && (
          <div className="flex items-center gap-2 mb-2.5">
            <RoundBtn onClick={() => resize(-1)}><Minus size={20} /></RoundBtn>
            <RoundBtn onClick={() => resize(1)}><Plus size={20} /></RoundBtn>
            <RoundBtn onClick={sendBackward}><ChevronDown size={20} /></RoundBtn>
            <RoundBtn onClick={bringForward}><ChevronUp size={20} /></RoundBtn>
            <div className="flex-1" />
            <RoundBtn onClick={delSel} danger><Trash2 size={20} /></RoundBtn>
          </div>
        )}

        {/* 2. Bande couleurs (ronds 30px) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar h-[34px]">
          {palette.map((col) => {
            const active = activeColor === col.toLowerCase();
            return (
              <button key={col} type="button" onClick={() => applyColor(col)}
                className="shrink-0 rounded-full"
                style={{ width: 30, height: 30, background: col, border: `${active ? 2.5 : 1.5}px solid ${active ? ACCENT : 'rgba(255,255,255,0.38)'}` }} />
            );
          })}
        </div>

        {/* 3. Filtres — seulement si photo de fond */}
        {bgPhoto && (
          <div className="flex items-end gap-2 overflow-x-auto no-scrollbar mt-3">
            {FILTERS.map(([key, name]) => {
              const active = filter === key;
              return (
                <button key={key} type="button" onClick={() => applyFilter(key)} className="shrink-0 flex flex-col items-center" style={{ width: 54 }}>
                  <span className="block overflow-hidden" style={{ width: 48, height: 48, borderRadius: 10, border: `${active ? 2.5 : 1}px solid ${active ? ACCENT : 'rgba(255,255,255,0.24)'}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bgPhoto} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: FILTER_CSS[key] === 'none' ? 'none' : FILTER_CSS[key] }} />
                  </span>
                  <span className="mt-1 text-[10px]" style={{ color: active ? ACCENT : 'rgba(255,255,255,0.7)', fontWeight: active ? 800 : 600 }}>{name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 4. Outils : Texte · Photo · Forme · Cercle */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <Tool onClick={addText} icon={<Type size={20} />} label="Texte" />
          <Tool onClick={() => fileRef.current?.click()} icon={<ImageIcon size={20} />} label="Photo" />
          <Tool onClick={() => addShape('rect')} icon={<Square size={20} />} label="Forme" />
          <Tool onClick={() => addShape('circle')} icon={<CircleIcon size={20} />} label="Cercle" />
        </div>

        {/* 5. Légende */}
        <input
          value={caption} onChange={(e) => setCaption(e.target.value)}
          placeholder="Écris une légende…"
          className="mt-3 w-full rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-white/50 outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
        />

        {/* 6. 3 actions IDENTIQUES au natif : Brouillon · Publier au feed · Exporter */}
        <div className="flex items-center gap-2 mt-3">
          <button type="button" onClick={() => flash('💾 Enregistré en brouillon')}
            className="flex flex-col items-center justify-center gap-0.5 w-16 h-[52px] rounded-2xl text-white text-[10px] font-medium active:scale-[0.98]" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Bookmark size={20} /> Brouillon
          </button>
          <button type="button" onClick={valider} disabled={!ready || saving}
            className="flex-1 inline-flex items-center justify-center gap-2 h-[52px] rounded-2xl text-white text-[15px] font-extrabold disabled:opacity-50 active:scale-[0.98]" style={{ backgroundColor: ACCENT }}>
            {saving ? <Loader2 size={20} className="animate-spin" /> : null}{saving ? 'Publication…' : 'Publier au feed'}
          </button>
          <button type="button" onClick={() => flash('Exporter — bientôt')}
            className="flex flex-col items-center justify-center gap-0.5 w-16 h-[52px] rounded-2xl text-white text-[10px] font-medium active:scale-[0.98]" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Share2 size={20} /> Exporter
          </button>
        </div>
      </div>
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 px-4 py-2 rounded-full text-white text-[13px] font-medium" style={{ backgroundColor: 'rgba(20,20,26,0.95)' }}>{toast}</div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
    </div>
  );
}

// Rond 40px white12 (rouge si danger) — natif _roundBtn.
function RoundBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 rounded-full flex items-center justify-center active:scale-95"
      style={{ width: 40, height: 40, backgroundColor: danger ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.12)', color: danger ? '#EF4444' : '#FFFFFF' }}>
      {children}
    </button>
  );
}

// Tuile outil white10 arrondi 12 — natif _tool.
function Tool({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl active:scale-95 text-white"
      style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}>
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
