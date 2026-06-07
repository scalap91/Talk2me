'use client';

import React, { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDraftAutoSave, saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';

interface Props {
  onClose: () => void;
  onPublished: () => void;
  /** Reprise d'un brouillon existant (Talk2Me #334). */
  resumeDraftId?: string | null;
  initialText?: string | null;
  initialVariant?: string | null;
}

export const TEXTE_BG_VARIANTS: Record<
  string,
  { label: string; bg: string; preview: string }
> = {
  neutral: {
    label: 'Neutre',
    bg: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
    preview: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
  },
  purple: {
    label: 'Violet',
    bg: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
    preview: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
  },
  blue: {
    label: 'Bleu',
    bg: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
    preview: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
  },
  warm: {
    label: 'Chaud',
    bg: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
    preview: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
  },
};

export default function TexteCardEditor({
  onClose,
  onPublished,
  resumeDraftId = null,
  initialText = null,
  initialVariant = null,
}: Props) {
  const [text, setText] = useState<string>(initialText || '');
  const [variant, setVariant] = useState<keyof typeof TEXTE_BG_VARIANTS>(
    (initialVariant as keyof typeof TEXTE_BG_VARIANTS) || 'neutral'
  );
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [draftIdLocal, setDraftIdLocal] = useState<string | null>(resumeDraftId);
  const [publishedOk, setPublishedOk] = useState(false);

  const canPublish = text.trim().length > 0 && !publishing;

  // Talk2Me #334 — auto-save (debounce 1.5s)
  const draftSnapshot = useMemo(
    () => ({ text, bg_variant: variant }),
    [text, variant]
  );

  useDraftAutoSave({
    value: draftSnapshot,
    type: 'texte',
    draftId: draftIdLocal,
    shouldSave: text.trim().length > 0 && !publishedOk,
    thumbnailUrl: null,
    title: text.slice(0, 80) || null,
    onSaved: (id) => setDraftIdLocal(id),
  });

  const handleClose = async () => {
    if (!publishedOk && text.trim().length > 0) {
      const id = await saveDraftNow({
        id: draftIdLocal,
        type: 'texte',
        draftData: draftSnapshot,
        thumbnailUrl: null,
        title: text.slice(0, 80),
      });
      if (id && id !== draftIdLocal) setDraftIdLocal(id);
    }
    onClose();
  };

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch('/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'texte',
          text: text.trim(),
          bg_variant: variant,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Publication échouée');
      // Talk2Me #334 — card publiée, supprime le brouillon
      setPublishedOk(true);
      if (draftIdLocal) {
        await deleteDraftNow(draftIdLocal);
        setDraftIdLocal(null);
      }
      onPublished();
    } catch (e: any) {
      setError(e?.message || 'Erreur inconnue');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] bg-[#0a0a0d]/95 backdrop-blur-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Créer une TexteCard"
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/8">
          <button
            type="button"
            onClick={handleClose}
            className="text-white/70 hover:text-white p-2 -ml-2"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-white/90 font-medium text-sm">Nouvelle TexteCard</h2>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-red-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {publishing ? 'Envoi…' : 'Publier'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Preview interactive */}
          <div
            className="w-full aspect-[4/5] max-h-[55vh] rounded-3xl flex items-center justify-center px-6 py-8 border border-white/8"
            style={{ background: TEXTE_BG_VARIANTS[variant].bg }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder="Écris ta pensée…"
              className="w-full h-full bg-transparent text-white text-lg font-medium text-center outline-none resize-none placeholder-white/30 leading-relaxed"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between text-xs text-white/40">
            <span>Background</span>
            <span>{text.length} / 200</span>
          </div>

          <div className="flex gap-2">
            {Object.entries(TEXTE_BG_VARIANTS).map(([key, v]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVariant(key as keyof typeof TEXTE_BG_VARIANTS)}
                className={`flex-1 h-12 rounded-xl border transition-all ${
                  variant === key
                    ? 'border-white/40 scale-[1.02]'
                    : 'border-white/10 hover:border-white/25'
                }`}
                style={{ background: v.preview }}
                aria-label={v.label}
                aria-pressed={variant === key}
                title={v.label}
              />
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm px-4 py-3">
              {error}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
