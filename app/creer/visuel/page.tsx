'use client';

/**
 * Designer de cards visuelles (Pascal 2026-07-04) — un mini-Canva DANS T2M.
 * Canvas Fabric.js : on compose (fond + texte + image + formes), on style, on exporte →
 * ça devient une card image. Isolé sur sa page (/creer/visuel), zéro impact sur le reste.
 * Objectif « marketplace du peuple » : n'importe qui fait un visuel pro en 2 min.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, Type, ImageIcon, Square, Circle as CircleIcon, Trash2, Loader2, Palette } from '@/lib/icons';

// Fabric v6 (module chargé dynamiquement, client-only).
type FabricMod = typeof import('fabric');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FCanvas = any;

const BG_SWATCHES = ['#1a1a22', '#0b1020', '#3a1418', '#18233a', '#2a1d20', '#FFFFFF', '#FF7F11', '#7C5CFF', '#0F9D58', '#E4405F'];
const FG_SWATCHES = ['#FFFFFF', '#000000', '#FF7F11', '#7C5CFF', '#0F9D58', '#FFD166', '#EF476F', '#118AB2'];

export default function VisuelPage() {
  const router = useRouter();
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabRef = useRef<FabricMod | null>(null);
  const cvRef = useRef<FCanvas>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    let cv: FCanvas;
    (async () => {
      const fabric = await import('fabric');
      fabRef.current = fabric;
      const w = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 24, 460);
      const h = Math.round((w * 5) / 4); // 4:5 portrait (format card T2M)
      cv = new fabric.Canvas(canvasEl.current!, { width: w, height: h, backgroundColor: BG_SWATCHES[0], preserveObjectStacking: true });
      cvRef.current = cv;
      setReady(true);
    })();
    return () => { try { cv?.dispose(); } catch { /* */ } };
  }, []);

  const addText = () => {
    const fabric = fabRef.current!, cv = cvRef.current;
    const t = new fabric.Textbox('Ton texte', { left: cv.width * 0.1, top: cv.height * 0.12, width: cv.width * 0.7, fontSize: Math.round(cv.width * 0.09), fill: '#fff', fontWeight: '700', fontFamily: 'Inter, sans-serif', textAlign: 'center' });
    cv.add(t); cv.setActiveObject(t); cv.requestRenderAll();
  };
  const addShape = (kind: 'rect' | 'circle') => {
    const fabric = fabRef.current!, cv = cvRef.current;
    const o = kind === 'rect'
      ? new fabric.Rect({ left: cv.width * 0.2, top: cv.height * 0.35, width: cv.width * 0.4, height: cv.width * 0.25, fill: '#FF7F11', rx: 14, ry: 14 })
      : new fabric.Circle({ left: cv.width * 0.25, top: cv.height * 0.35, radius: cv.width * 0.18, fill: '#7C5CFF' });
    cv.add(o); cv.setActiveObject(o); cv.requestRenderAll();
  };
  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const fabric = fabRef.current!, cv = cvRef.current;
      const img = await fabric.FabricImage.fromURL(String(reader.result));
      img.scaleToWidth(cv.width * 0.7); img.set({ left: cv.width * 0.15, top: cv.height * 0.5 });
      cv.add(img); cv.setActiveObject(img); cv.requestRenderAll();
    };
    reader.readAsDataURL(f);
  };
  const delSel = () => { const cv = cvRef.current; const a = cv.getActiveObject(); if (a) { cv.remove(a); cv.requestRenderAll(); } };
  const setBg = (color: string) => { const cv = cvRef.current; cv.backgroundColor = color; cv.requestRenderAll(); };
  const colorSel = (color: string) => { const cv = cvRef.current; const a = cv.getActiveObject(); if (a) { a.set('fill', color); cv.requestRenderAll(); } };

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
      const r = await fetch('/api/cards/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'image', media_url: up.url, caption: '' }) });
      const d = await r.json().catch(() => null);
      router.push(d?.card?.id ? `/home#card-${d.card.id}` : '/home');
    } catch { alert('Échec de la publication du visuel. Réessaie.'); setSaving(false); }
  };

  const Btn = ({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl active:scale-95 transition text-[#2F343A]">
      <span className="text-[#6A7585]">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F5F6F8]" style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#E7EAF0]">
        <button type="button" onClick={() => router.back()} aria-label="Fermer" className="w-9 h-9 rounded-full bg-[#F0F2F5] flex items-center justify-center text-[#2F343A]"><X size={20} /></button>
        <div className="text-[15px] font-bold text-[#2F343A]">Créer un visuel</div>
        <button type="button" onClick={valider} disabled={saving || !ready} className="px-4 h-9 rounded-full bg-[#FF7F11] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Publier
        </button>
      </header>

      {/* Canvas */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
        <div className="rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(30,20,60,0.12)]">
          <canvas ref={canvasEl} />
        </div>
      </div>

      {/* Palette de couleurs (contextuelle) */}
      {showColors && (
        <div className="px-3 py-2 bg-white border-t border-[#E7EAF0]">
          <div className="text-[10px] text-[#9DAAB7] mb-1">Couleur de l'élément sélectionné</div>
          <div className="flex gap-2 flex-wrap">
            {FG_SWATCHES.map((c) => <button key={c} type="button" onClick={() => colorSel(c)} className="w-8 h-8 rounded-full border border-black/10" style={{ background: c }} />)}
          </div>
          <div className="text-[10px] text-[#9DAAB7] mt-2 mb-1">Fond</div>
          <div className="flex gap-2 flex-wrap">
            {BG_SWATCHES.map((c) => <button key={c} type="button" onClick={() => setBg(c)} className="w-8 h-8 rounded-full border border-black/10" style={{ background: c }} />)}
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      <div className="flex items-center justify-around px-2 py-2 bg-white border-t border-[#E7EAF0]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 8px)' }}>
        <Btn onClick={addText} icon={<Type size={22} />} label="Texte" />
        <Btn onClick={() => fileRef.current?.click()} icon={<ImageIcon size={22} />} label="Image" />
        <Btn onClick={() => addShape('rect')} icon={<Square size={22} />} label="Forme" />
        <Btn onClick={() => addShape('circle')} icon={<CircleIcon size={22} />} label="Rond" />
        <Btn onClick={() => setShowColors((v) => !v)} icon={<Palette size={22} />} label="Couleur" />
        <Btn onClick={delSel} icon={<Trash2 size={22} />} label="Suppr." />
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
    </div>
  );
}
