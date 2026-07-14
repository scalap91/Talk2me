'use client';

/**
 * VideoEditorOverlays — overlays/modales de l'éditeur VideoCard, extraits de
 * VideoCardEditor (#51 modularisation, Pascal 2026-06-29). AUCUN changement de
 * comportement : même JSX, piloté par props. Regroupe : aperçu card, loader
 * baking, dialogue « ajouter un clip » (caméra/galerie), modale caméra, picker
 * music-hub.
 */
import { RefObject } from 'react';
import { X, Loader2, Camera, ImageIcon } from '@/lib/icons';
import VideoTextOverlay from './VideoTextOverlay';
import InlineCamera from './InlineCamera';
import MusicPickerSheet from '@/components/cards/MusicPickerSheet';
import type { CardDraft } from '@/lib/card-draft-store';
import type { UnifiedCard } from '@/lib/embed-hub/types';

interface Props {
  // Aperçu
  showPreviewModal: boolean;
  setShowPreviewModal: (v: boolean) => void;
  draft: CardDraft | null;
  localPreview: string | null;
  audioPreviewUrl: string | null;
  finalCaption: string;
  canPublish: boolean;
  onPublish: () => void;
  // Baking
  bakingMessage: string | null;
  publishing: boolean;
  // Ajouter un clip
  showAddDialog: boolean;
  setShowAddDialog: (v: boolean) => void;
  setShowCamera: (v: boolean) => void;
  galleryInputRef: RefObject<HTMLInputElement | null>;
  onGalleryFile: (f: File) => void;
  addingClip: boolean;
  // Caméra
  showCamera: boolean;
  onCameraClipReady: (url: string, dur: number, size: number) => void;
  // Music-Hub
  musicPickerOpen: boolean;
  setMusicPickerOpen: (v: boolean) => void;
  onMusicSelect: (card: UnifiedCard) => void;
}

export default function VideoEditorOverlays({
  showPreviewModal, setShowPreviewModal, draft, localPreview, audioPreviewUrl,
  finalCaption, canPublish, onPublish, bakingMessage, publishing,
  showAddDialog, setShowAddDialog, setShowCamera, galleryInputRef, onGalleryFile, addingClip,
  showCamera, onCameraClipReady, musicPickerOpen, setMusicPickerOpen, onMusicSelect,
}: Props) {
  return (
    <>
      {/* Modal aperçu */}
      {showPreviewModal && draft && localPreview && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-10 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-[#12121a] border border-white/8 rounded-3xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b border-white/8">
              <span className="text-white/80 text-sm">
                Aperçu de la card
                {audioPreviewUrl && (
                  <span className="ml-1.5 text-[10px] text-red-300">• avec musique</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-white/60 hover:text-white"
                aria-label="Fermer l'aperçu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative bg-black">
              <div className="relative w-full" style={{ aspectRatio: '9 / 16' }}>
                <video
                  src={audioPreviewUrl || localPreview}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  loop
                  muted={!audioPreviewUrl}
                  playsInline
                />
                <VideoTextOverlay
                  texts={draft.texts}
                  currentTimeSource={(draft.trim?.start_s ?? 0) + 0.5}
                  trim={draft.trim ?? null}
                />
              </div>
            </div>
            {finalCaption && (
              <div className="px-4 py-3 text-[13.5px] text-white/85 whitespace-pre-wrap leading-snug">
                {finalCaption}
              </div>
            )}
            <div className="px-4 py-3 border-t border-white/8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-white/60 text-sm"
              >
                Continuer l&apos;édition
              </button>
              <button
                type="button"
                onClick={() => { setShowPreviewModal(false); onPublish(); }}
                disabled={!canPublish}
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-red-700 text-white text-sm font-medium disabled:opacity-40"
              >
                Publier maintenant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loader baking */}
      {bakingMessage && publishing && (
        <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none">
          <Loader2 className="w-8 h-8 text-red-300 animate-spin" />
          <div className="text-white/85 text-sm">{bakingMessage}</div>
          <div className="text-white/40 text-[11px]">Cela peut prendre 10 à 60 secondes.</div>
        </div>
      )}

      {/* Add clip dialog (Caméra / Galerie) */}
      {showAddDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ajouter un clip"
          className="absolute inset-0 z-30 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAddDialog(false)}
          data-testid="add-clip-dialog"
        >
          <div
            className="bg-[#12121a] border border-white/10 rounded-3xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-medium text-sm">Ajouter un clip</span>
              <button
                type="button"
                onClick={() => setShowAddDialog(false)}
                className="text-white/60 hover:text-white"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setShowAddDialog(false); setShowCamera(true); }}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-white/[0.05] border border-white/12 hover:bg-white/[0.08] text-white"
                data-testid="add-clip-camera"
              >
                <Camera className="w-7 h-7" />
                <span className="text-sm">Caméra</span>
                <span className="text-[10px] text-white/45">avec compte-à-rebours</span>
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-white/[0.05] border border-white/12 hover:bg-white/[0.08] text-white"
                data-testid="add-clip-gallery"
              >
                <ImageIcon className="w-7 h-7" />
                <span className="text-sm">Galerie</span>
                <span className="text-[10px] text-white/45">vidéo de ton téléphone</span>
              </button>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onGalleryFile(f);
                e.target.value = '';
              }}
            />
            {addingClip && (
              <div className="mt-4 flex items-center gap-2 text-white/70 text-[12px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Ajout du clip…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Caméra = SYSTÈME UNIQUE InlineCamera (Pascal 2026-07-14 : les 2 caméras qui se
          chevauchaient sont unifiées — l'ancien CameraCaptureModal #421 est remplacé). Mode vidéo →
          renvoie l'URL uploadée ; la durée est mesurée en aval par handleCameraClipReady
          (measureClipDuration), donc dur/size passés à 0. Une photo prise par erreur ici = ignorée
          (on ne colle pas une image dans le montage vidéo). */}
      {showCamera && (
        <div className="fixed inset-0 z-[150] bg-black">
          <InlineCamera
            initialMode="video"
            onCapture={({ url, type }) => { if (type === 'video') void onCameraClipReady(url, 0, 0); else setShowCamera(false); }}
            onCancel={() => setShowCamera(false)}
          />
        </div>
      )}

      {/* Music-Hub picker (bottom-sheet) */}
      <MusicPickerSheet
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(card) => onMusicSelect(card)}
      />
    </>
  );
}
