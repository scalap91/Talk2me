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
import { X, Image as ImageIcon, Video as VideoIcon, Type, Disc3, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ImageCardEditor from '@/components/cards/editors/ImageCardEditor';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import TexteCardEditor from '@/components/cards/editors/TexteCardEditor';
import GabaritEditor from '@/components/cards/editors/GabaritEditor';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

type EditorKind = null | 'image' | 'video' | 'texte' | 'gabarit';
type GabaritZone = 'video' | 'son' | 'produit';

interface CardCreationSheetProps {
  open: boolean;
  onClose: () => void;
  /** Nom de l'IA personnelle pour l'éditeur (transmis à ImageCard/VideoCard). */
  aiName?: string | null;
  aiAvatarUrl?: string | null;
  /** Talk2Me #422 — son présélectionné (bouton + Music Card) → pré-attaché à
   *  la VideoCard. */
  presetMusic?: UnifiedCard | null;
  /** Talk2Me #425 — produit présélectionné (via Léa) → ouvre direct l'éditeur
   *  vidéo (gabarit) avec le produit attaché. */
  presetProduct?: ProductCardData | null;
}

export default function CardCreationSheet({
  open,
  onClose,
  aiName = null,
  aiAvatarUrl = null,
  presetMusic = null,
  presetProduct = null,
}: CardCreationSheetProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorKind>(null);
  // Talk2Me #422 — on SNAPSHOTTE la musique présélectionnée au moment d'ouvrir
  // l'éditeur. Sinon `onClose()` (closeSheet) remet presetMusic à null AVANT
  // que l'éditeur ne la lise → le son n'arrivait jamais avec le bouton +.
  const [editorMusic, setEditorMusic] = useState<UnifiedCard | null>(null);
  // Talk2Me #425 — idem pour le produit présélectionné (via Léa).
  const [editorProduct, setEditorProduct] = useState<ProductCardData | null>(null);
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

  // Talk2Me #426 — zone du gabarit ciblée à l'ouverture du GabaritEditor.
  const [gabaritZone, setGabaritZone] = useState<GabaritZone | null>(null);

  const openEditor = (kind: Exclude<EditorKind, null>) => {
    setEditorMusic(presetMusic); // snapshot AVANT que onClose n'efface le store
    setEditorProduct(presetProduct);
    setEditor(kind);
    onClose();
  };

  // Ouvre le GabaritEditor (page de composition) sur une zone donnée.
  const openGabarit = (focus: GabaritZone | null) => {
    setEditorProduct(presetProduct); // produit via Léa éventuel
    setGabaritZone(focus);
    setEditor('gabarit');
    onClose();
  };

  // Talk2Me #425/426 — produit présélectionné (via Léa) → ouvre le gabarit avec
  // le produit déjà attaché (zone produit remplie).
  useEffect(() => {
    if (open && presetProduct && !editor) {
      openGabarit(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetProduct, editor]);

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

            {/* Talk2Me #425 — GABARIT composite (Pascal) : au-dessus des icônes.
                On sélectionne une zone pour la remplir. La zone vidéo (haut)
                ouvre l'éditeur ; les zones son/produit ouvrent l'éditeur sur le
                bon slot. Vidéo audible + fond musical par-dessus + produit→Shop. */}
            <p className="text-[12.5px] text-white/55 mb-2 leading-relaxed">
              Gabarit produit — tape une zone à remplir :
            </p>
            <div className="mb-4 rounded-2xl border border-white/12 overflow-hidden bg-white/[0.02]">
              <button
                type="button"
                onClick={() => openGabarit('video')}
                className="w-full aspect-[16/7] flex flex-col items-center justify-center gap-1 border-b border-white/10 hover:bg-white/[0.05] active:scale-[0.99] transition"
              >
                <VideoIcon className="w-6 h-6 text-white/75" />
                <span className="text-[12px] text-white/75">Vidéo</span>
              </button>
              <div className="grid grid-cols-2 divide-x divide-white/10">
                <button
                  type="button"
                  onClick={() => openGabarit('son')}
                  className="py-4 flex flex-col items-center gap-1 hover:bg-white/[0.05] active:scale-[0.98] transition"
                >
                  <Disc3 className="w-5 h-5 text-white/70" />
                  <span className="text-[11px] text-white/65">Son (fond musical)</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGabarit('produit')}
                  className="py-4 flex flex-col items-center gap-1 hover:bg-white/[0.05] active:scale-[0.98] transition"
                >
                  <ShoppingBag className="w-5 h-5 text-violet-300" />
                  <span className="text-[11px] text-violet-200/90">Produit / lien</span>
                </button>
              </div>
            </div>

            <p className="text-[12.5px] text-white/45 mb-3 leading-relaxed">
              …ou un format simple :
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
      {editor === 'gabarit' && (
        <GabaritEditor
          onClose={closeEditor}
          onPublished={onPublished}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
          initialFocus={gabaritZone}
          initialProduct={editorProduct}
        />
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
