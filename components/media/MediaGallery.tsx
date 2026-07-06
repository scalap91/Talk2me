'use client';

/**
 * Talk2Me — GALERIE PHOTO NATIVE (Pascal 2026-06-09).
 * Sélecteur réutilisable : mes photos rangées dans l'appli (table user_media),
 * grille + recherche + import (le téléphone une seule fois, après c'est dans T2M).
 * Tap une photo → onSelect(url). Réutilisable pour story / boutique / cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Plus, Loader2 } from '@/lib/icons';

interface Media { url: string; kind: string; label: string | null; created_at: number }

export default function MediaGallery({
  open,
  onClose,
  onSelect,
  kind = 'image',
  title = 'Mes médias',
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  kind?: string;
  title?: string;
}) {
  const [media, setMedia] = useState<Media[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const u = new URL('/api/media', window.location.origin);
      if (kind) u.searchParams.set('kind', kind);
      if (query.trim()) u.searchParams.set('q', query.trim());
      const d = await fetch(u.toString().replace(window.location.origin, ''), { cache: 'no-store' }).then((r) => r.json());
      if (d?.ok) setMedia(d.media || []);
    } catch { /* */ } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { if (open) load(q); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  // recherche en direct (léger debounce)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Importer une NOUVELLE photo du téléphone → on l'utilise directement (pas de copie).
  const importNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await fetch('/api/upload', { method: 'POST', body: fd }).then((r) => r.json());
      if (up?.url) { onSelect(up.url); onClose(); }
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md h-[80dvh] sm:h-[70dvh] bg-[#0e0e12] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/8 shrink-0">
          <h2 className="text-[16px] font-medium text-white/95">{title}</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
        </div>
        {/* Recherche */}
        <div className="px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2">
            <Search size={16} className="text-white/40 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans mes photos…"
              className="bg-transparent text-[14px] text-white outline-none w-full placeholder:text-white/35" />
          </div>
        </div>
        {/* Grille */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {/* Tuile Import */}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border border-dashed border-white/20 bg-white/[0.03] grid place-items-center text-white/60 hover:bg-white/[0.06] active:scale-[0.98]">
              {importing ? <Loader2 className="w-6 h-6 animate-spin" /> : <span className="flex flex-col items-center gap-1"><Plus className="w-6 h-6" /><span className="text-[11px]">Importer</span></span>}
            </button>
            {media.map((m) => (
              <button key={m.url} type="button" onClick={() => { onSelect(m.url); onClose(); }}
                className="relative aspect-square rounded-xl overflow-hidden border border-white/10 active:scale-[0.98]">
                {m.kind === 'video'
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  ? <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={m.url} alt={m.label || ''} className="w-full h-full object-cover" />}
              </button>
            ))}
          </div>
          {!loading && media.length === 0 && (
            <p className="text-center text-[13px] text-white/40 mt-10 px-6">Aucun média pour l’instant.<br />Touche <b className="text-white/70">Importer</b> pour en choisir un depuis ton téléphone.</p>
          )}
          {loading && <div className="flex justify-center mt-8"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>}
        </div>
        <input ref={fileRef} type="file" accept={kind === 'video' ? 'video/*' : 'image/*'} className="hidden" onChange={importNew} />
      </div>
    </div>
  );
}
