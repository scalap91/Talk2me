'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface BoutiqueCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export default function BoutiqueCreateSheet({ open, onClose, onCreated }: BoutiqueCreateSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [origCover, setOrigCover] = useState<string | null>(null);
  const [cleaningCover, setCleaningCover] = useState(false);

  // Améliore la photo de couverture (éclaircir/contraste, sans détourer) — garde l'original.
  const enhanceCover = async () => {
    if (!coverUrl || cleaningCover) return;
    setCleaningCover(true);
    try {
      const r = await fetch('/api/boutique/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: coverUrl, cleanOnly: true, cleanBg: 'enhance' }) });
      const d = await r.json();
      if (r.ok && d.cleanedUrl) { setOrigCover(coverUrl); setCoverUrl(d.cleanedUrl); }
    } finally { setCleaningCover(false); }
  };
  const dragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setCoverUrl(null);
      setPos({ x: 50, y: 50 });
      setError('');
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setPos({ x: 50, y: 50 });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const j = await res.json();
      if (j.url) setCoverUrl(j.url);
      else setError("Erreur lors de l'upload de l'image");
    } catch {
      setError("Erreur lors de l'upload de l'image");
    } finally {
      setUploading(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!coverUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: { ...pos },
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, Math.min(100, dragRef.current.startPos.x - (dx / rect.width) * 100));
    const newY = Math.max(0, Math.min(100, dragRef.current.startPos.y - (dy / rect.height) * 100));
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  const handleSubmit = async () => {
    if (!name.trim() || uploading) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/boutiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          cover_url: coverUrl,
          cover_position: `${Math.round(pos.x)}% ${Math.round(pos.y)}%`,
        }),
      });
      const j = await res.json();
      if (res.ok && j.boutique) {
        onCreated?.(j.boutique.id);
        onClose();
      } else {
        setError(j.error || "Erreur lors de la création");
      }
    } catch {
      setError("Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-lg bg-[#12121a] rounded-t-3xl shadow-2xl border-t border-white/10 max-h-[90vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Créer ma boutique</h2>
                <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Cover */}
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Photo de couverture</label>
                <div
                  className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] select-none touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{ cursor: coverUrl ? (dragging ? 'grabbing' : 'grab') : 'pointer' }}
                  onClick={() => {
                    if (!coverUrl && !uploading) fileInputRef.current?.click();
                  }}
                >
                  {uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/40">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm">Upload...</span>
                    </div>
                  ) : coverUrl ? (
                    <>
                      <img
                        src={coverUrl}
                        alt="Cover"
                        draggable={false}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                      />
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white/80 text-[11px] px-3 py-1 rounded-full">
                        Glisse pour ajuster
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1 rounded-full transition-colors"
                      >
                        Changer
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); origCover ? (setCoverUrl(origCover), setOrigCover(null)) : enhanceCover(); }}
                        disabled={cleaningCover}
                        className="absolute top-2 left-2 bg-red-600/90 hover:bg-red-600 text-white text-xs px-3 py-1 rounded-full transition-colors disabled:opacity-50"
                      >
                        {cleaningCover ? '…' : origCover ? '↩ Original' : '✨ Améliorer'}
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/30 cursor-pointer">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs">Photo de couverture (paysage)</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverSelect}
                />
              </div>

              {/* Nom */}
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Nom de la boutique *</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Ex: Mes créations"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 transition-colors text-sm"
                />
                <p className="text-xs text-white/30 mt-1 text-right">{name.length}/60</p>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="Décrivez votre boutique..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 transition-colors text-sm resize-none"
                />
                <p className="text-xs text-white/30 mt-1 text-right">{description.length}/200</p>
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!name.trim() || uploading || submitting}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/30 text-white font-medium transition-colors text-sm"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Création...
                  </span>
                ) : (
                  'Créer la boutique'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
