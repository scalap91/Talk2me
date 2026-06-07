'use client';

/**
 * CardCreationSheet — Bottom-sheet "Créer une card" (Pascal 2026-06-04 #334).
 *
 * Doctrine :
 *  - Bouton central + du BottomNav → ouvre cette sheet
 *  - 3 options : Photo / Vidéo / Texte
 *  - Ouvre l'éditeur correspondant en plein écran
 *  - [[talktome-design-premium]] : dark sobre, accents subtils
 *  - [[talk2me-card-editor-ia]] : éditeur monté ici pour pouvoir l'ouvrir
 *    depuis n'importe quelle page (BottomNav global)
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Video as VideoIcon, Type } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ImageCardEditor from '@/components/cards/editors/ImageCardEditor';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import TexteCardEditor from '@/components/cards/editors/TexteCardEditor';
import type { UnifiedCard } from '@/lib/embed-hub/types';

type EditorKind = null | 'image' | 'video' | 'texte';

interface CardCreationSheetProps {
  open: boolean;
  onClose: () => void;
  /** Nom de l'IA personnelle pour l'éditeur (transmis à ImageCard/VideoCard). */
  aiName?: string | null;
  aiAvatarUrl?: string | null;
  /** Talk2Me #422 — son présélectionné (bouton + Music Card) → pré-attaché à
   *  la VideoCard. */
  presetMusic?: UnifiedCard | null;
}

export default function CardCreationSheet({
  open,
  onClose,
  aiName = null,
  aiAvatarUrl = null,
  presetMusic = null,
}: CardCreationSheetProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorKind>(null);
  // Talk2Me #422 — on SNAPSHOTTE la musique présélectionnée au moment d'ouvrir
  // l'éditeur. Sinon `onClose()` (closeSheet) remet presetMusic à null AVANT
  // que l'éditeur ne la lise → le son n'arrivait jamais avec le bouton +.
  const [editorMusic, setEditorMusic] = useState<UnifiedCard | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc → close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const openEditor = (kind: Exclude<EditorKind, null>) => {
    setEditorMusic(presetMusic); // snapshot AVANT que onClose n'efface le store
    setEditor(kind);
    onClose();
  };

  const closeEditor = () => setEditor(null);

  const onPublished = () => {
    setEditor(null);
    // Recharge le feed pour voir la nouvelle card
    router.refresh();
  };

  if (!mounted) return null;

  const sheet = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cardsheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-sm flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Créer une card"
        >
          <motion.div
            key="cardsheet-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#12121a] border-t border-white/8 rounded-t-3xl px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.4)]"
          >
            {/* Handle */}
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-medium text-white/95">
                Créer une card
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12.5px] text-white/55 mb-5 leading-relaxed">
              Choisis un format. L&apos;éditeur s&apos;ouvrira avec ton IA en mode
              assistance.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <SheetButton
                icon={<ImageIcon className="w-6 h-6" />}
                label="Photo"
                onClick={() => openEditor('image')}
                accent="from-pink-500/30 to-orange-500/20"
                testId="cardsheet-image"
              />
              <SheetButton
                icon={<VideoIcon className="w-6 h-6" />}
                label="Vidéo"
                onClick={() => openEditor('video')}
                accent="from-red-500/30 to-red-700/20"
                testId="cardsheet-video"
              />
              <SheetButton
                icon={<Type className="w-6 h-6" />}
                label="Texte"
                onClick={() => openEditor('texte')}
                accent="from-emerald-500/30 to-cyan-500/20"
                testId="cardsheet-texte"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const editorOverlay = (
    <>
      {editor === 'image' && (
        <ImageCardEditor
          onClose={closeEditor}
          onPublished={onPublished}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
        />
      )}
      {editor === 'video' && (
        <VideoCardEditor
          onClose={closeEditor}
          onPublished={onPublished}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
          initialMusic={editorMusic}
        />
      )}
      {editor === 'texte' && (
        <TexteCardEditor onClose={closeEditor} onPublished={onPublished} />
      )}
    </>
  );

  return createPortal(
    <>
      {sheet}
      {editorOverlay}
    </>,
    document.body
  );
}

function SheetButton({
  icon,
  label,
  onClick,
  accent,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-colors text-white/90 active:scale-[0.97]"
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${accent} border border-white/10`}
      >
        {icon}
      </div>
      <span className="text-[12.5px] font-medium">{label}</span>
    </button>
  );
}
