'use client';

/**
 * ImageCardEditor — Éditeur ImageCard avec IA personnelle (Mode Éditeur).
 *
 * Doctrine :
 *  - [[talk2me-card-editor-ia]] : IA propose, humain valide
 *  - Commandes IA + outils manuels en PARALLÈLE (jamais l'un sans l'autre)
 *  - Undo/Redo via card-draft-store
 *  - Aperçu + Publier (validation explicite obligatoire)
 *  - [[talktome-design-premium]] : dark sobre, accents subtils
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  Loader2,
  Undo2,
  Redo2,
  Square,
  Smartphone,
  Monitor,
  Image as ImageIcon,
  Type,
  Sparkles,
  Trash2,
  Plus,
  Eye,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useCardDraftStore, type CropRatio, type FilterKind, type TextPos } from '@/lib/card-draft-store';
import { useDraftAutoSave, saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';
import CardAIPanel from './CardAIPanel';

interface Props {
  onClose: () => void;
  onPublished: () => void;
  /** Nom de l'IA personnelle du user (ex "T2M de Pascal"). */
  aiName?: string | null;
  /** Avatar URL de l'IA (sinon gradient). */
  aiAvatarUrl?: string | null;
  /**
   * Reprise d'un brouillon existant (Talk2Me #334). Si fourni :
   *  - on skip le file picker,
   *  - le store doit avoir été pré-rempli par le caller avec resumeDraftId
   *    pointant vers une /uploads/xxx déjà uploadée (source_url).
   *  - auto-save met à jour ce même id.
   */
  resumeDraftId?: string | null;
  /** URL serveur (/uploads/...) de l'image source (mode resume). */
  initialPreviewUrl?: string | null;
  /** Talk2Me #428 — mode "zone du gabarit" : renvoie l'image au lieu de publier. */
  returnMode?: boolean;
  onResult?: (r: { imageUrl: string; caption: string | null }) => void;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const FILTER_CSS: Record<FilterKind, string> = {
  none: 'none',
  auto: 'contrast(1.08) saturate(1.12) brightness(1.04)',
  bright: 'brightness(1.15) saturate(1.08)',
  warm: 'sepia(0.18) saturate(1.18) hue-rotate(-8deg) brightness(1.05)',
  cold: 'saturate(1.08) hue-rotate(8deg) brightness(0.98) contrast(1.05)',
  soft: 'contrast(0.95) brightness(1.05) saturate(0.95) blur(0.2px)',
};

const CROP_ASPECT: Record<CropRatio, number | null> = {
  square: 1,
  vertical: 9 / 16,
  horizontal: 16 / 9,
  original: null,
};

export default function ImageCardEditor({
  onClose,
  onPublished,
  aiName,
  aiAvatarUrl,
  resumeDraftId = null,
  initialPreviewUrl = null,
  returnMode = false,
  onResult,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(
    initialPreviewUrl ? ({ name: 'draft.jpg', size: 0 } as unknown as File) : null
  );
  const [localPreview, setLocalPreview] = useState<string | null>(initialPreviewUrl);
  const [serverUrl, setServerUrl] = useState<string | null>(
    initialPreviewUrl && initialPreviewUrl.startsWith('/uploads/') ? initialPreviewUrl : null
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  // Talk2Me #334 — auto-save brouillon
  const [draftIdLocal, setDraftIdLocal] = useState<string | null>(resumeDraftId);
  const [publishedOk, setPublishedOk] = useState(false);

  // Draft store
  const draft = useCardDraftStore((s) => s.draft);
  const initDraft = useCardDraftStore((s) => s.initDraft);
  const resetDraft = useCardDraftStore((s) => s.resetDraft);
  const setCrop = useCardDraftStore((s) => s.setCrop);
  const setFilter = useCardDraftStore((s) => s.setFilter);
  const addText = useCardDraftStore((s) => s.addText);
  const removeText = useCardDraftStore((s) => s.removeText);
  const updateText = useCardDraftStore((s) => s.updateText);
  const setTitle = useCardDraftStore((s) => s.setTitle);
  const setDescription = useCardDraftStore((s) => s.setDescription);
  const addHashtag = useCardDraftStore((s) => s.addHashtag);
  const removeHashtag = useCardDraftStore((s) => s.removeHashtag);
  const setHashtags = useCardDraftStore((s) => s.setHashtags);
  const undo = useCardDraftStore((s) => s.undo);
  const redo = useCardDraftStore((s) => s.redo);
  const past = useCardDraftStore((s) => s.past);
  const future = useCardDraftStore((s) => s.future);

  const effectiveAiName =
    typeof aiName === 'string' && aiName.trim() !== '' ? aiName.trim() : 'Mon IA';

  // Cleanup local preview + draft on unmount
  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview);
      }
      resetDraft();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Talk2Me #334 — snapshot du draft pour auto-save (source_url = serverUrl
  // si dispo, sinon on attend l'upload pour éviter de persister un blob:).
  const draftSnapshot = useMemo(() => {
    if (!draft) return null;
    return { ...draft, source_url: serverUrl || draft.source_url };
  }, [draft, serverUrl]);

  useDraftAutoSave({
    value: draftSnapshot,
    type: 'image',
    draftId: draftIdLocal,
    shouldSave: !returnMode && !!draftSnapshot && !!serverUrl && !publishedOk,
    thumbnailUrl: serverUrl,
    title: draft?.title || null,
    onSaved: (id) => setDraftIdLocal(id),
  });

  const handleFile = async (f: File) => {
    setError(null);
    if (!ACCEPTED.includes(f.type)) {
      setError('Format image non supporté (jpg, png, webp).');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError(`Image trop lourde (${(f.size / 1024 / 1024).toFixed(1)} Mo, max 5 Mo).`);
      return;
    }
    setFile(f);
    if (localPreview && localPreview.startsWith('blob:')) {
      URL.revokeObjectURL(localPreview);
    }
    const url = URL.createObjectURL(f);
    setLocalPreview(url);
    // Init draft avec l'URL locale (preview) — sera remplacée dans le store
    // par /uploads/... dès que l'upload est terminé (pour auto-save).
    initDraft('image', url);
    // Talk2Me #334 — upload immédiat pour avoir source_url stable pour le brouillon
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson?.error || 'Upload échoué');
      setServerUrl(upJson.url);
    } catch (e: any) {
      setError(e?.message || 'Upload échoué');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    if (localPreview && localPreview.startsWith('blob:')) {
      URL.revokeObjectURL(localPreview);
    }
    setLocalPreview(null);
    setServerUrl(null);
    setFile(null);
    setError(null);
    resetDraft();
    setNewTagInput('');
  };

  const handleAddTag = () => {
    const t = newTagInput.trim();
    if (!t) return;
    addHashtag(t);
    setNewTagInput('');
  };

  // Drag d'un texte overlay (touch + mouse) ---------------------
  const onTextPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setDraggingTextId(id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPreviewPointerMove = (e: React.PointerEvent) => {
    if (!draggingTextId || !previewWrapRef.current) return;
    const r = previewWrapRef.current.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    updateText(draggingTextId, {
      x_pct: Math.max(2, Math.min(98, x)),
      y_pct: Math.max(2, Math.min(98, y)),
    });
  };

  const onPreviewPointerUp = () => {
    setDraggingTextId(null);
  };

  // Validation + publication -----------------------------------
  const canPublish = !!draft && !error && !uploading && (!!file || !!serverUrl);

  const publish = async () => {
    if (!draft || !canPublish) return;
    setUploading(true);
    setError(null);
    try {
      // 1) si serverUrl déjà connu (uploaded à la sélection ou reprise de draft),
      //    on réutilise. Sinon on upload maintenant.
      let mediaUrl = serverUrl;
      if (!mediaUrl) {
        if (!file) throw new Error('Aucune image sélectionnée.');
        const fd = new FormData();
        fd.append('file', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson?.error || 'Upload échoué');
        mediaUrl = upJson.url as string;
      }
      const upJson = { url: mediaUrl };

      // 2) Construit la caption finale : titre + description + hashtags
      //    (l'API /cards/create n'a pas (encore) de champ structurés pour
      //    title/desc/hashtags séparés ; on emboîte proprement).
      const parts: string[] = [];
      if (draft.title) parts.push(draft.title.trim());
      if (draft.description) parts.push(draft.description.trim());
      if (draft.hashtags.length > 0) {
        parts.push(draft.hashtags.map((h) => `#${h}`).join(' '));
      }
      const caption = parts.join('\n').slice(0, 200);

      // Talk2Me #428 — mode gabarit : on renvoie l'image au composer.
      if (returnMode) {
        onResult?.({ imageUrl: upJson.url as string, caption: caption || null });
        setPublishedOk(true);
        if (draftIdLocal) {
          await deleteDraftNow(draftIdLocal);
          setDraftIdLocal(null);
        }
        return;
      }

      const cardRes = await fetch('/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          media_url: upJson.url,
          caption: caption || null,
        }),
      });
      const cardJson = await cardRes.json();
      if (!cardRes.ok) throw new Error(cardJson?.error || 'Publication échouée');
      // Talk2Me #334 — card publiée, on supprime le brouillon
      setPublishedOk(true);
      if (draftIdLocal) {
        await deleteDraftNow(draftIdLocal);
        setDraftIdLocal(null);
      }
      onPublished();
    } catch (e: any) {
      setError(e?.message || 'Erreur inconnue');
    } finally {
      setUploading(false);
    }
  };

  // Talk2Me #334 — close = save final (si pas déjà publié)
  const handleClose = async () => {
    if (!returnMode && !publishedOk && draftSnapshot && serverUrl) {
      const id = await saveDraftNow({
        id: draftIdLocal,
        type: 'image',
        draftData: draftSnapshot,
        thumbnailUrl: serverUrl,
        title: draft?.title || null,
      });
      if (id && id !== draftIdLocal) setDraftIdLocal(id);
    }
    reset();
    onClose();
  };

  // Helpers UI -------------------------------------------------
  const cropBtnCls = (r: CropRatio) =>
    `px-3 py-1.5 rounded-full text-[12px] flex items-center gap-1.5 border transition-colors ${
      draft?.crop === r
        ? 'bg-white/[0.12] border-white/25 text-white'
        : 'bg-transparent border-white/10 text-white/60 hover:border-white/20'
    }`;

  const filterBtnCls = (f: FilterKind) =>
    `px-2.5 py-1.5 rounded-full text-[11.5px] border transition-colors ${
      draft?.filter === f
        ? 'bg-white/[0.12] border-white/25 text-white'
        : 'bg-transparent border-white/10 text-white/55 hover:border-white/20'
    }`;

  // Aperçu final : on simule la card du feed
  const finalCaption = (() => {
    if (!draft) return '';
    const parts: string[] = [];
    if (draft.title) parts.push(draft.title.trim());
    if (draft.description) parts.push(draft.description.trim());
    if (draft.hashtags.length > 0) parts.push(draft.hashtags.map((h) => `#${h}`).join(' '));
    return parts.join('\n');
  })();

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
        aria-label="Éditeur ImageCard"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/8 flex-shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="text-white/70 hover:text-white p-2 -ml-2"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center">
            <h2 className="text-white/90 font-medium text-sm">Éditeur ImageCard</h2>
            {draft && (
              <div className="text-[10px] text-white/40 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Assisté par {effectiveAiName}
              </div>
            )}
            {/* Talk2Me #341 — Lot 2 N8/N9 : badge mode actif (compétences gelées) */}
            <span
              data-testid="mode-badge"
              data-mode="card_editor_image"
              className="mt-1 text-[10px] uppercase tracking-wider text-red-200 bg-red-500/15 border border-red-400/25 px-1.5 py-0.5 rounded-full"
            >
              Mode : Éditeur image
            </span>
          </div>
          <div className="flex items-center gap-1">
            {draft && (
              <>
                <button
                  type="button"
                  onClick={() => undo()}
                  disabled={past.length === 0}
                  className="p-2 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Annuler"
                  title="Annuler"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => redo()}
                  disabled={future.length === 0}
                  className="p-2 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Rétablir"
                  title="Rétablir"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="px-2 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-white/80 text-[11.5px] flex items-center gap-1.5 ml-1"
                  aria-label="Aperçu"
                  title="Aperçu"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Aperçu
                </button>
              </>
            )}
            <button
              type="button"
              onClick={publish}
              disabled={!canPublish}
              className="ml-1 px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-red-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Envoi…' : 'Publier'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!localPreview || !draft ? (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full aspect-[4/5] max-h-[60vh] rounded-3xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-3 text-white/60 hover:bg-white/[0.04] hover:border-white/25 transition-colors"
              >
                <Upload className="w-8 h-8" />
                <span className="text-sm">Choisir une image</span>
                <span className="text-xs text-white/40">jpg / png / webp — max 5 Mo</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 max-w-6xl mx-auto">
              {/* Colonne gauche : preview + outils */}
              <div className="flex-1 space-y-3 min-w-0">
                {/* Preview avec crop ratio + filtre + textes overlay */}
                <div className="relative w-full bg-black rounded-3xl overflow-hidden flex items-center justify-center">
                  <div
                    ref={previewWrapRef}
                    className="relative w-full"
                    style={{
                      aspectRatio:
                        CROP_ASPECT[draft.crop] !== null
                          ? `${CROP_ASPECT[draft.crop]}`
                          : '4 / 5',
                      maxHeight: '55vh',
                    }}
                    onPointerMove={onPreviewPointerMove}
                    onPointerUp={onPreviewPointerUp}
                    onPointerLeave={onPreviewPointerUp}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={localPreview}
                      alt="Aperçu"
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover select-none"
                      style={{ filter: FILTER_CSS[draft.filter] }}
                    />
                    {/* Texts overlays draggables */}
                    {draft.texts.map((t) => (
                      <div
                        key={t.id}
                        onPointerDown={(e) => onTextPointerDown(e, t.id)}
                        className="absolute -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab active:cursor-grabbing px-2 py-1 rounded-md select-none"
                        style={{
                          left: `${t.x_pct}%`,
                          top: `${t.y_pct}%`,
                          color: t.color,
                          fontSize: `${t.fontSize}px`,
                          fontWeight: 600,
                          textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                          background: 'rgba(0,0,0,0.18)',
                          backdropFilter: 'blur(2px)',
                          maxWidth: '90%',
                          textAlign: 'center',
                          lineHeight: 1.15,
                          border: draggingTextId === t.id ? '1px dashed rgba(255,255,255,0.6)' : '1px solid transparent',
                        }}
                      >
                        {t.content}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeText(t.id);
                          }}
                          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center"
                          aria-label="Supprimer le texte"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>
                    {file?.name} · {(file!.size / 1024 / 1024).toFixed(2)} Mo
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-white/60 hover:text-white underline"
                  >
                    Changer
                  </button>
                </div>

                {/* Crop ratio */}
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">
                    Recadrage
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={cropBtnCls('original')} onClick={() => setCrop('original')}>
                      <ImageIcon className="w-3.5 h-3.5" /> Original
                    </button>
                    <button type="button" className={cropBtnCls('square')} onClick={() => setCrop('square')}>
                      <Square className="w-3.5 h-3.5" /> 1:1
                    </button>
                    <button type="button" className={cropBtnCls('vertical')} onClick={() => setCrop('vertical')}>
                      <Smartphone className="w-3.5 h-3.5" /> 9:16
                    </button>
                    <button type="button" className={cropBtnCls('horizontal')} onClick={() => setCrop('horizontal')}>
                      <Monitor className="w-3.5 h-3.5" /> 16:9
                    </button>
                  </div>
                </div>

                {/* Filtres */}
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">Filtres</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={filterBtnCls('none')} onClick={() => setFilter('none')}>Aucun</button>
                    <button type="button" className={filterBtnCls('auto')} onClick={() => setFilter('auto')}>Auto</button>
                    <button type="button" className={filterBtnCls('bright')} onClick={() => setFilter('bright')}>Vif</button>
                    <button type="button" className={filterBtnCls('warm')} onClick={() => setFilter('warm')}>Chaud</button>
                    <button type="button" className={filterBtnCls('cold')} onClick={() => setFilter('cold')}>Froid</button>
                    <button type="button" className={filterBtnCls('soft')} onClick={() => setFilter('soft')}>Doux</button>
                  </div>
                </div>

                {/* Ajouter texte */}
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">
                    Textes
                  </div>
                  <AddTextRow onAdd={(content, position) => addText(content, position)} />
                  {draft.texts.length > 0 && (
                    <div className="text-[11px] text-white/40">
                      Tu peux déplacer les textes en les glissant directement sur l&apos;image.
                    </div>
                  )}
                </div>

                {/* Champs metadata */}
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Titre</div>
                    <div className="flex items-center gap-2">
                      <input
                        value={draft.title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Titre court"
                        maxLength={80}
                        className="flex-1 rounded-2xl bg-white/[0.04] border border-white/8 px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/20"
                      />
                      <ManualGenButton
                        field="title"
                        onApply={(val) => typeof val === 'string' && setTitle(val)}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">
                      Description
                    </div>
                    <div className="flex items-start gap-2">
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Description"
                        rows={2}
                        maxLength={400}
                        className="flex-1 rounded-2xl bg-white/[0.04] border border-white/8 px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/20 resize-none"
                      />
                      <ManualGenButton
                        field="description"
                        onApply={(val) => typeof val === 'string' && setDescription(val)}
                      />
                    </div>
                    <div className="text-[10px] text-white/30 text-right mt-0.5">
                      {draft.description.length} / 400
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">
                      Hashtags
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {draft.hashtags.map((h) => (
                        <span
                          key={h}
                          className="inline-flex items-center gap-1 bg-white/[0.06] border border-white/10 rounded-full pl-2.5 pr-1 py-0.5 text-[12px] text-white/85"
                        >
                          #{h}
                          <button
                            type="button"
                            onClick={() => removeHashtag(h)}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-white/60 hover:text-white"
                            aria-label={`Supprimer #${h}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder="+ hashtag"
                        className="w-28 rounded-full bg-white/[0.04] border border-white/8 px-3 py-1 text-[12px] text-white placeholder-white/30 outline-none focus:border-white/20"
                      />
                      <ManualGenButton
                        field="hashtags"
                        onApply={(val) => {
                          if (Array.isArray(val)) setHashtags(val.filter((x): x is string => typeof x === 'string'));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Colonne droite : panneau IA */}
              <div className="lg:w-[360px] lg:flex-shrink-0">
                <CardAIPanel
                  aiName={effectiveAiName}
                  aiAvatarUrl={aiAvatarUrl ?? null}
                  mode="card_editor_image"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm px-4 py-3 mt-4">
              {error}
            </div>
          )}
        </div>

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
                <span className="text-white/80 text-sm">Aperçu de la card</span>
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
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio:
                      CROP_ASPECT[draft.crop] !== null
                        ? `${CROP_ASPECT[draft.crop]}`
                        : '4 / 5',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localPreview}
                    alt="Aperçu final"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: FILTER_CSS[draft.filter] }}
                  />
                  {draft.texts.map((t) => (
                    <div
                      key={t.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-md select-none"
                      style={{
                        left: `${t.x_pct}%`,
                        top: `${t.y_pct}%`,
                        color: t.color,
                        fontSize: `${t.fontSize}px`,
                        fontWeight: 600,
                        textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                        background: 'rgba(0,0,0,0.18)',
                        backdropFilter: 'blur(2px)',
                        maxWidth: '90%',
                        textAlign: 'center',
                        lineHeight: 1.15,
                      }}
                    >
                      {t.content}
                    </div>
                  ))}
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
                  onClick={() => {
                    setShowPreviewModal(false);
                    publish();
                  }}
                  disabled={!canPublish}
                  className="px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-red-700 text-white text-sm font-medium disabled:opacity-40"
                >
                  Publier maintenant
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/* Sous-composant : ajout de texte overlay manuel.                          */
/* ----------------------------------------------------------------------- */

function AddTextRow({
  onAdd,
}: {
  onAdd: (content: string, position: TextPos) => void;
}) {
  const [val, setVal] = useState('');
  const [pos, setPos] = useState<TextPos>('center');
  const submit = () => {
    const t = val.trim();
    if (!t) return;
    onAdd(t.slice(0, 60), pos);
    setVal('');
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Type className="w-3.5 h-3.5 text-white/40" />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Texte à ajouter"
        maxLength={60}
        className="flex-1 min-w-[120px] rounded-full bg-white/[0.04] border border-white/8 px-3 py-1.5 text-[12.5px] text-white placeholder-white/30 outline-none focus:border-white/20"
      />
      <select
        value={pos}
        onChange={(e) => setPos(e.target.value as TextPos)}
        className="rounded-full bg-white/[0.04] border border-white/8 px-2 py-1.5 text-[12px] text-white/80 outline-none"
      >
        <option value="top" className="bg-[#12121a]">Haut</option>
        <option value="center" className="bg-[#12121a]">Centre</option>
        <option value="bottom" className="bg-[#12121a]">Bas</option>
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={val.trim().length === 0}
        className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/12 text-white flex items-center justify-center disabled:opacity-40"
        aria-label="Ajouter le texte"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Bouton "régénérer" un champ (titre/description/hashtags) côté serveur.   */
/* ----------------------------------------------------------------------- */

function ManualGenButton({
  field,
  onApply,
}: {
  field: 'title' | 'description' | 'hashtags';
  onApply: (val: string | string[]) => void;
}) {
  const draft = useCardDraftStore((s) => s.draft);
  const [loading, setLoading] = useState(false);

  const click = async () => {
    if (!draft || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cards/editor/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          draft: {
            type: draft.type,
            crop: draft.crop,
            filter: draft.filter,
            texts: draft.texts.map((t) => ({ content: t.content, position: t.position })),
            title: draft.title,
            description: draft.description,
            hashtags: draft.hashtags,
          },
          ...(field === 'description' ? { length: 'short' } : {}),
          ...(field === 'hashtags' ? { count: 6 } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.value !== undefined) {
        onApply(json.value);
      }
    } catch (e) {
      console.error('[ManualGenButton] error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={loading || !draft}
      title="Générer avec l'IA"
      aria-label="Générer avec l'IA"
      className="flex-shrink-0 w-9 h-9 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 hover:bg-red-500/25 flex items-center justify-center disabled:opacity-40"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
    </button>
  );
}
