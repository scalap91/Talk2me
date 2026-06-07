'use client';

/**
 * VideoCardEditor — Éditeur VideoCard avec IA personnelle (Mode Éditeur).
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - IA propose, humain valide
 *  - Commandes IA + outils manuels en PARALLÈLE
 *  - Undo/Redo via card-draft-store
 *  - Aperçu LIVE sans baking (CSS overlays + currentTime simulé pour trim)
 *  - Baking ffmpeg UNIQUEMENT au "Publier"
 *  - Validation explicite obligatoire
 *  - [[talktome-design-premium]] : dark sobre, accents subtils
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  Loader2,
  Undo2,
  Redo2,
  Sparkles,
  Type,
  Plus,
  Eye,
  Camera,
  Play,
  Pause,
  Scissors,
  ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useCardDraftStore,
  type TextPos,
  ensureClipsCompat,
  totalClipsDuration,
} from '@/lib/card-draft-store';
import { useDraftAutoSave, saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';
import CardAIPanel from './CardAIPanel';
import VideoTimeline from './VideoTimeline';
import VideoTextOverlay from './VideoTextOverlay';
import AudioPickerTab from './AudioPickerTab';
import VideoClipsTimeline from './VideoClipsTimeline';
import VideoFiltersTab from './VideoFiltersTab';
import CameraCaptureModal from './CameraCaptureModal';
import { filterCss, type FilterPreset } from '@/lib/video-filters';
// Talk2Me #422 — Picker music-hub (module isolé)
import MusicPickerSheet from '@/components/cards/MusicPickerSheet';
import MusicExtractPicker from '@/components/cards/editors/MusicExtractPicker';
import MusicMixer from '@/components/cards/editors/MusicMixer';
import ProductPicker from '@/components/cards/editors/ProductPicker';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

interface Props {
  onClose: () => void;
  onPublished: () => void;
  /** Nom de l'IA personnelle du user (ex "T2M de Pascal"). */
  aiName?: string | null;
  /** Avatar URL de l'IA (sinon gradient). */
  aiAvatarUrl?: string | null;
  /**
   * Mode démo/screenshot : pré-remplit l'éditeur avec une vidéo serveur
   * existante sans passer par le picker de fichier (utilisé par /demo-p329).
   * Quand fourni, le draft doit avoir été initialisé en amont par le caller.
   */
  demoPreviewUrl?: string | null;
  demoFileName?: string | null;
  demoFileSizeBytes?: number | null;
  /**
   * Reprise d'un brouillon existant (Talk2Me #334). Si fourni, le store doit
   * avoir été pré-rempli par le caller (cf /drafts/[id]/edit).
   */
  resumeDraftId?: string | null;
  /**
   * Talk2Me #422 — musique pré-attachée (bouton + d'un titre Music Card).
   * Initialise `attachedMusic` → le disque vinyle est prêt avant même d'ajouter
   * la vidéo.
   */
  initialMusic?: UnifiedCard | null;
  /**
   * Talk2Me #425 — produit pré-attaché (via Léa, "+ Créer une card"). La card
   * publiée ira dans le Hub (description + aperçu) ET dans le Shop. Affiché en
   * slot "produit" du gabarit.
   */
  initialProduct?: ProductCardData | null;
  /** Talk2Me #425 — ouvre direct le picker produit (entrée zone "produit"). */
  autoOpenProductPicker?: boolean;
  /**
   * Talk2Me #426 — mode "zone du gabarit" : l'éditeur NE publie pas, il RENVOIE
   * la vidéo finale (onResult) puis se ferme → on revient au gabarit qui montre
   * le résultat. Masque les slots son/produit (gérés par le gabarit).
   */
  returnMode?: boolean;
  onResult?: (r: { videoUrl: string; caption: string | null }) => void;
}

const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 Mo (aligné serveur #422)
const MAX_DURATION_SEC = 600; // 10 min
const ACCEPTED = ['video/mp4', 'video/webm'];

export default function VideoCardEditor({
  onClose,
  onPublished,
  aiName,
  aiAvatarUrl,
  demoPreviewUrl,
  demoFileName,
  demoFileSizeBytes,
  resumeDraftId = null,
  initialMusic = null,
  initialProduct = null,
  autoOpenProductPicker = false,
  returnMode = false,
  onResult,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<File | null>(
    demoPreviewUrl
      ? ({ name: demoFileName || 'demo.mp4', size: demoFileSizeBytes || 0 } as unknown as File)
      : null
  );
  const [localPreview, setLocalPreview] = useState<string | null>(
    demoPreviewUrl || null
  );
  const [serverUrl, setServerUrl] = useState<string | null>(
    demoPreviewUrl && demoPreviewUrl.startsWith('/uploads/') ? demoPreviewUrl : null
  );
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [bakingMessage, setBakingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  // Talk2Me #420 — onglets outils (trim/cover gérés inline timeline ;
  // les onglets switchent texts vs music). #421 ajoute filtres.
  const [toolTab, setToolTab] = useState<'texts' | 'music' | 'filters'>('texts');
  // Talk2Me #420 — URL preview audio mixée (renvoyée par /add-audio).
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  // Talk2Me #422 — musique attachée via music-hub (disque vinyle rotatif)
  const [attachedMusic, setAttachedMusic] = useState<UnifiedCard | null>(
    initialMusic ?? null
  );
  // Talk2Me #425 — produit attaché (slot produit du gabarit) → Hub + Shop.
  const [attachedProduct, setAttachedProduct] = useState<ProductCardData | null>(
    initialProduct ?? null
  );
  const [showProductPicker, setShowProductPicker] = useState(false);
  // Entrée par la zone "produit" du gabarit → ouvre direct le picker.
  useEffect(() => {
    if (autoOpenProductPicker && !initialProduct) setShowProductPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  // Talk2Me #421 — multi-clips UI state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [addingClip, setAddingClip] = useState(false);

  // Draft store
  const draft = useCardDraftStore((s) => s.draft);
  const initDraft = useCardDraftStore((s) => s.initDraft);
  const resetDraft = useCardDraftStore((s) => s.resetDraft);
  const setDuration = useCardDraftStore((s) => s.setDuration);
  const setTrim = useCardDraftStore((s) => s.setTrim);
  const clearTrim = useCardDraftStore((s) => s.clearTrim);
  const setCoverTime = useCardDraftStore((s) => s.setCoverTime);
  const addText = useCardDraftStore((s) => s.addText);
  const removeText = useCardDraftStore((s) => s.removeText);
  const setTitle = useCardDraftStore((s) => s.setTitle);
  const setDescription = useCardDraftStore((s) => s.setDescription);
  const addHashtag = useCardDraftStore((s) => s.addHashtag);
  const removeHashtag = useCardDraftStore((s) => s.removeHashtag);
  const setHashtags = useCardDraftStore((s) => s.setHashtags);
  const undo = useCardDraftStore((s) => s.undo);
  const redo = useCardDraftStore((s) => s.redo);
  const past = useCardDraftStore((s) => s.past);
  const future = useCardDraftStore((s) => s.future);
  // Talk2Me #421 multi-clips
  const addClip = useCardDraftStore((s) => s.addClip);
  const removeClip = useCardDraftStore((s) => s.removeClip);
  const updateClip = useCardDraftStore((s) => s.updateClip);
  const reorderClips = useCardDraftStore((s) => s.reorderClips);
  const selectClip = useCardDraftStore((s) => s.selectClip);
  const setClipFilter = useCardDraftStore((s) => s.setClipFilter);
  const setAllClipsFilter = useCardDraftStore((s) => s.setAllClipsFilter);
  const setTransitionAt = useCardDraftStore((s) => s.setTransitionAt);

  const effectiveAiName =
    typeof aiName === 'string' && aiName.trim() !== '' ? aiName.trim() : 'Mon IA';

  // Talk2Me #334 — auto-save brouillon
  const [draftIdLocal, setDraftIdLocal] = useState<string | null>(resumeDraftId);
  const [publishedOk, setPublishedOk] = useState(false);

  const draftSnapshot = useMemo(() => {
    if (!draft) return null;
    return { ...draft, source_url: serverUrl || draft.source_url };
  }, [draft, serverUrl]);

  useDraftAutoSave({
    value: draftSnapshot,
    type: 'video',
    draftId: draftIdLocal,
    shouldSave: !!draftSnapshot && !!serverUrl && !publishedOk,
    thumbnailUrl: serverUrl,
    title: draft?.title || null,
    onSaved: (id) => setDraftIdLocal(id),
  });

  // Cleanup
  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview);
      }
      resetDraft();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #422 — applique le volume/mute de la piste VIDÉO en live sur l'aperçu
  // quand on bouge le mixeur (le son musique est géré à la lecture de la card).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !attachedMusic) return;
    const vv = (attachedMusic.meta as { video_volume?: number } | undefined)?.video_volume ?? 1;
    v.volume = Math.max(0, Math.min(1, vv));
    v.muted = vv <= 0;
  }, [attachedMusic]);

  // --- File handling ----------------------------------------------
  const handleFile = (f: File) => {
    setError(null);
    if (!ACCEPTED.includes(f.type)) {
      setError('Format vidéo non supporté (mp4 ou webm uniquement).');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError(`Vidéo trop lourde (${(f.size / 1024 / 1024).toFixed(1)} Mo, max 200 Mo).`);
      return;
    }
    setFile(f);
    if (localPreview) URL.revokeObjectURL(localPreview);
    const url = URL.createObjectURL(f);
    setLocalPreview(url);
    // Upload immédiat pour avoir une /uploads/xxx.mp4 stable côté serveur
    // qu'on pourra passer à apply-video-ops au publish.
    uploadSource(f);
    // Init draft (sera mis à jour avec duration au loadedmetadata)
    initDraft('video', url);
  };

  const uploadSource = async (f: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Upload échoué');
      setServerUrl(json.url);
    } catch (e: any) {
      setError(e?.message || 'Upload échoué');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setServerUrl(null);
    setFile(null);
    setError(null);
    setCurrentTime(0);
    setIsPlaying(false);
    resetDraft();
    setNewTagInput('');
  };

  // Talk2Me #421 — clips dérivés (compat ascendante draft 1-clip)
  const { clips, transitions } = useMemo(() => {
    if (!draft) return { clips: [], transitions: [] };
    return ensureClipsCompat(draft);
  }, [draft]);

  // #421 — quand l'upload initial est terminé (serverUrl prêt), on remplace
  // l'URL blob du premier clip par la vraie URL /uploads/ pour que ffmpeg
  // puisse la résoudre au baking.
  useEffect(() => {
    if (!serverUrl || !draft || !draft.clips || draft.clips.length === 0) return;
    const first = draft.clips[0];
    if (first.source_url.startsWith('blob:') || first.source_url === '') {
      updateClip(first.id, { source_url: serverUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  const selectedClipId = draft?.selected_clip_id ?? null;
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    return clips.find((c) => c.id === selectedClipId) || null;
  }, [clips, selectedClipId]);
  // Le clip "actif" (preview/trim) : sélection > premier clip.
  const activeClip = selectedClip || clips[0] || null;
  const activeClipIndex = activeClip
    ? clips.findIndex((c) => c.id === activeClip.id)
    : -1;

  const isMultiClips = clips.length > 1;

  // --- Mesure metadata pour un clip uploadé (utilisé par caméra + galerie) ---
  const measureClipDuration = (url: string): Promise<number> =>
    new Promise((resolve) => {
      try {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = url;
        const to = setTimeout(() => resolve(0), 8000);
        v.onloadedmetadata = () => {
          clearTimeout(to);
          const d = v.duration;
          resolve(isFinite(d) && d > 0 ? d : 0);
        };
        v.onerror = () => {
          clearTimeout(to);
          resolve(0);
        };
      } catch {
        resolve(0);
      }
    });

  // --- Helper #421 : ajoute un clip déjà uploadé (url /uploads/) ---
  // - Si c'est le tout premier clip (pas de draft), on initDraft +
  //   patch le clip avec la duration mesurée.
  // - Sinon on append via addClip.
  const addUploadedClip = (
    url: string,
    duration: number,
    fileMeta?: { name: string; size: number }
  ) => {
    const dur = duration > 0 ? duration : 5;
    if (!draft) {
      initDraft('video', url);
      // initDraft a créé le 1er clip avec trim_end_sec=0/duration=0 ;
      // on patche en lisant le state à jour via le store directement.
      const st = useCardDraftStore.getState();
      const cur = st.draft;
      if (cur?.clips && cur.clips[0]) {
        st.updateClip(cur.clips[0].id, {
          trim_start_sec: 0,
          trim_end_sec: dur,
          duration_original_sec: dur,
        });
        st.selectClip(cur.clips[0].id);
      }
      setServerUrl(url);
      setLocalPreview(url);
      setFile({
        name: fileMeta?.name || 'clip.mp4',
        size: fileMeta?.size || 0,
      } as unknown as File);
      return;
    }
    addClip({
      source_url: url,
      trim_start_sec: 0,
      trim_end_sec: dur,
      duration_original_sec: dur,
      filter: null,
      thumbnail_url: null,
    });
  };

  // --- Add clip from camera (#421) ---
  const handleCameraClipReady = async (url: string, recordedDur: number, _size: number) => {
    setShowCamera(false);
    setShowAddDialog(false);
    setAddingClip(true);
    try {
      const duration = (await measureClipDuration(url)) || recordedDur || 5;
      addUploadedClip(url, duration, { name: 'camera.webm', size: 0 });
    } catch (e: any) {
      setError(e?.message || 'Erreur ajout clip');
    } finally {
      setAddingClip(false);
    }
  };

  // --- Add clip from gallery (#421) ---
  const handleGalleryFile = async (f: File) => {
    setShowAddDialog(false);
    setAddingClip(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Upload échoué');
      const url = json.url as string;
      const blobUrl = URL.createObjectURL(f);
      const duration = (await measureClipDuration(blobUrl)) || 5;
      URL.revokeObjectURL(blobUrl);
      addUploadedClip(url, duration, { name: f.name, size: f.size });
    } catch (e: any) {
      setError(e?.message || 'Upload échoué');
    } finally {
      setAddingClip(false);
    }
  };

  // --- Video events ----------------------------------------------
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    if (!isFinite(d) || d <= 0) return;
    if (d > MAX_DURATION_SEC) {
      setError(`Vidéo trop longue (${d.toFixed(1)}s, max ${MAX_DURATION_SEC}s).`);
      return;
    }
    // #421 multi-clips : on patch la duration du clip actif s'il n'est pas
    // encore renseigné (cas où on a ajouté un clip sans pré-mesure HTML5).
    if (isMultiClips && activeClip) {
      if (activeClip.duration_original_sec <= 0) {
        updateClip(activeClip.id, {
          duration_original_sec: d,
          trim_end_sec: activeClip.trim_end_sec > 0 ? activeClip.trim_end_sec : d,
        });
      }
      // En multi-clips on ne pousse PAS draft.duration_s — c'est lié au
      // 1er clip via le store directement.
      return;
    }
    setDuration(d);
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !draft) return;
    const t = v.currentTime;
    setCurrentTime(t);
    // #421 multi-clips : si activeClip défini, on simule sur son trim local.
    if (isMultiClips && activeClip) {
      if (t >= activeClip.trim_end_sec - 0.02) {
        v.pause();
        v.currentTime = activeClip.trim_start_sec;
        setCurrentTime(activeClip.trim_start_sec);
        setIsPlaying(false);
      }
      return;
    }
    // Legacy : si on dépasse end_s, pause + remet à start_s
    if (draft.trim && t >= draft.trim.end_s - 0.02) {
      v.pause();
      v.currentTime = draft.trim.start_s;
      setCurrentTime(draft.trim.start_s);
      setIsPlaying(false);
    }
  };

  const onSeek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !draft) return;
    if (v.paused) {
      if (isMultiClips && activeClip) {
        if (
          v.currentTime < activeClip.trim_start_sec ||
          v.currentTime >= activeClip.trim_end_sec - 0.05
        ) {
          v.currentTime = activeClip.trim_start_sec;
        }
      } else if (draft.trim && v.currentTime < draft.trim.start_s) {
        v.currentTime = draft.trim.start_s;
      }
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  // --- Manual ops -------------------------------------------------
  const handleUseCurrentAsCover = () => {
    if (!draft) return;
    if (isMultiClips && activeClip) {
      // En multi-clips, le cover s'exprime dans la timeline FINALE concaténée.
      // On somme les durées des clips précédents + (currentTime - trim_start_sec)
      let acc = 0;
      for (const c of clips) {
        if (c.id === activeClip.id) {
          acc += Math.max(0, currentTime - c.trim_start_sec);
          break;
        }
        acc += Math.max(0, c.trim_end_sec - c.trim_start_sec);
      }
      setCoverTime(acc);
      return;
    }
    // Cover time est exprimé dans la timeline FINALE (post-trim)
    const t = draft.trim ? Math.max(0, currentTime - draft.trim.start_s) : currentTime;
    setCoverTime(t);
  };

  const handleAddTrimAtCurrent = (which: 'start' | 'end') => {
    if (!draft) return;
    if (isMultiClips && activeClip) {
      if (which === 'start') {
        updateClip(activeClip.id, {
          trim_start_sec: Math.min(currentTime, activeClip.trim_end_sec - 0.2),
          trim_end_sec: activeClip.trim_end_sec,
        });
      } else {
        updateClip(activeClip.id, {
          trim_start_sec: activeClip.trim_start_sec,
          trim_end_sec: Math.max(currentTime, activeClip.trim_start_sec + 0.2),
        });
      }
      return;
    }
    if (!draft.duration_s) return;
    const cur = draft.trim ?? { start_s: 0, end_s: draft.duration_s };
    if (which === 'start') {
      setTrim(Math.min(currentTime, cur.end_s - 0.2), cur.end_s);
    } else {
      setTrim(cur.start_s, Math.max(currentTime, cur.start_s + 0.2));
    }
  };

  const handleAddTag = () => {
    const t = newTagInput.trim();
    if (!t) return;
    addHashtag(t);
    setNewTagInput('');
  };

  // --- Publish ----------------------------------------------------
  const canPublish =
    !!file && !!draft && !!serverUrl && !error && !publishing && !uploading;

  const publish = async () => {
    if (!canPublish || !draft || !serverUrl) return;
    setPublishing(true);
    setError(null);
    setBakingMessage('Préparation de ta vidéo…');
    try {
      // Determine si on doit baker
      // Talk2Me #421 : multi-clips OU per-clip filter → baking obligatoire.
      const hasMultiClipsBake =
        clips.length > 1 ||
        clips.some((c) => c.filter && c.filter !== 'none');

      const needsBaking =
        hasMultiClipsBake ||
        !!draft.trim ||
        draft.texts.length > 0 ||
        (typeof draft.cover_time_s === 'number' && draft.cover_time_s > 0) ||
        !!draft.audio; // Talk2Me #420 — audio requiert un bake aussi.

      let finalVideoUrl = serverUrl;
      let coverUrl: string | null = null;

      if (needsBaking) {
        setBakingMessage(
          hasMultiClipsBake
            ? `Concaténation de ${clips.length} clips…`
            : 'Application des modifications (ffmpeg)…'
        );
        // Construction du body : si multi-clips, on envoie clips[] + transitions[]
        // sinon legacy trim (compat ascendante).
        const opsBody: any = {
          source_url: serverUrl,
          ops: {
            cover_time_s:
              typeof draft.cover_time_s === 'number' ? draft.cover_time_s : 0,
            texts: draft.texts.map((t) => ({
              content: t.content,
              position: t.position,
              start_s: t.start_s ?? null,
              end_s: t.end_s ?? null,
            })),
            audio: draft.audio
              ? {
                  audio_url: draft.audio.audio_url,
                  video_volume: draft.audio.video_volume,
                  audio_volume: draft.audio.audio_volume,
                  audio_offset_sec: draft.audio.audio_offset_sec,
                }
              : null,
          },
        };
        if (hasMultiClipsBake || clips.length > 0) {
          // #421 : envoi de l'array clips[]
          opsBody.ops.clips = clips.map((c) => ({
            source_url: c.source_url,
            trim_start_sec: c.trim_start_sec,
            trim_end_sec: c.trim_end_sec,
            duration_original_sec: c.duration_original_sec,
            filter: c.filter || null,
          }));
          opsBody.ops.transitions = transitions.map((t) => ({
            type: t.type,
            duration_ms: t.duration_ms,
          }));
        } else if (draft.trim) {
          opsBody.ops.trim = draft.trim;
        }
        const bakeRes = await fetch('/api/cards/editor/apply-video-ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opsBody),
        });
        const bakeJson = await bakeRes.json();
        if (!bakeRes.ok || !bakeJson?.ok) {
          throw new Error(bakeJson?.detail || bakeJson?.error || 'Baking ffmpeg échoué');
        }
        finalVideoUrl = bakeJson.final_video_url;
        coverUrl = bakeJson.cover_url;
      }

      setBakingMessage('Publication…');
      // Construit la caption finale
      const parts: string[] = [];
      if (draft.title) parts.push(draft.title.trim());
      if (draft.description) parts.push(draft.description.trim());
      if (draft.hashtags.length > 0) {
        parts.push(draft.hashtags.map((h) => `#${h}`).join(' '));
      }
      const caption = parts.join('\n').slice(0, 200);

      // Talk2Me #426 — mode gabarit : on renvoie la vidéo au lieu de publier.
      if (returnMode) {
        onResult?.({ videoUrl: finalVideoUrl, caption: caption || null });
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
          type: 'video',
          media_url: finalVideoUrl,
          caption: caption || null,
          // #422 — attache la musique sélectionnée via music-hub
          attached_audio: attachedMusic ?? null,
          // #425 — attache le produit (la card ira aussi dans le Shop)
          attached_product: attachedProduct ?? null,
        }),
      });
      const cardJson = await cardRes.json();
      if (!cardRes.ok) throw new Error(cardJson?.error || 'Publication échouée');
      // (cover_url retournée par ffmpeg n'est pas encore stockée par /cards/create
      // V1. La vidéo finale contient déjà le frame cover en first frame visible.)
      void coverUrl;
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
      setPublishing(false);
      setBakingMessage(null);
    }
  };

  // Talk2Me #334 — close = save final si pas déjà publié
  const handleClose = async () => {
    if (!publishedOk && draftSnapshot && serverUrl) {
      const id = await saveDraftNow({
        id: draftIdLocal,
        type: 'video',
        draftData: draftSnapshot,
        thumbnailUrl: serverUrl,
        title: draft?.title || null,
      });
      if (id && id !== draftIdLocal) setDraftIdLocal(id);
    }
    reset();
    onClose();
  };

  // --- Render -----------------------------------------------------
  const trimDuration = useMemo(() => {
    // #421 — somme des clips trimmés, ou fallback legacy trim
    if (clips.length > 0) {
      return totalClipsDuration(clips);
    }
    if (!draft || !draft.trim) return draft?.duration_s ?? 0;
    return Math.max(0, draft.trim.end_s - draft.trim.start_s);
  }, [clips, draft]);

  // #421 — quand on a multi-clips, le <video> en preview pointe sur le clip
  // sélectionné. Sinon legacy localPreview.
  const previewVideoSrc = useMemo(() => {
    if (isMultiClips && activeClip) {
      return activeClip.source_url;
    }
    return localPreview;
  }, [isMultiClips, activeClip, localPreview]);

  const previewVideoFilterCss = useMemo(() => {
    if (activeClip?.filter) return filterCss(activeClip.filter);
    return '';
  }, [activeClip?.filter]);

  // Quand on change de clip sélectionné en multi-clips, on remet currentTime
  // au trim_start du clip.
  useEffect(() => {
    if (!isMultiClips || !activeClip || !videoRef.current) return;
    const v = videoRef.current;
    const onLoaded = () => {
      v.currentTime = Math.max(0, activeClip.trim_start_sec);
    };
    if (v.readyState >= 1) {
      onLoaded();
    } else {
      v.addEventListener('loadedmetadata', onLoaded, { once: true });
      return () => v.removeEventListener('loadedmetadata', onLoaded);
    }
  }, [activeClip?.id, isMultiClips]);

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
        aria-label="Éditeur VideoCard"
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
            <h2 className="text-white/90 font-medium text-sm">Éditeur VideoCard</h2>
            {draft && (
              <div className="text-[10px] text-white/40 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Assisté par {effectiveAiName}
              </div>
            )}
            {/* Talk2Me #341 — Lot 2 N8/N9 : badge mode actif (compétences gelées) */}
            <span
              data-testid="mode-badge"
              data-mode="card_editor_video"
              className="mt-1 text-[10px] uppercase tracking-wider text-red-200 bg-red-500/15 border border-red-400/25 px-1.5 py-0.5 rounded-full"
            >
              Mode : Éditeur vidéo
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
              {(publishing || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
              {publishing
                ? returnMode
                  ? 'Validation…'
                  : 'Publication…'
                : uploading
                  ? 'Upload…'
                  : returnMode
                    ? 'Valider la vidéo'
                    : 'Publier'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Talk2Me #425 — slot PRODUIT (masqué en mode gabarit : le gabarit gère son/produit). */}
          {!returnMode && (attachedProduct ? (
            <div className="max-w-md mx-auto mb-4 flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-2.5">
              {attachedProduct.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachedProduct.image_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover bg-white/10 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="font-emoji text-xl">🛍️</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-violet-200/80 font-medium">🛍️ Produit attaché → ira dans le Shop</div>
                <div className="text-[13px] text-white/95 truncate">{attachedProduct.title}</div>
                {attachedProduct.price_label && (
                  <div className="text-[12px] text-violet-200/90">{attachedProduct.price_label}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAttachedProduct(null)}
                className="text-[11px] text-white/60 hover:text-white shrink-0 px-2"
                aria-label="Retirer le produit"
              >
                Retirer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="max-w-md mx-auto mb-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-400/30 bg-violet-500/[0.06] py-2.5 text-[13px] font-medium text-violet-100 hover:bg-violet-500/10"
            >
              <span className="font-emoji">🛍️</span> Ajouter un produit (→ Shop)
            </button>
          ))}
          {!returnMode && showProductPicker && (
            <ProductPicker
              onPick={(p) => {
                setAttachedProduct(p);
                setShowProductPicker(false);
              }}
              onClose={() => setShowProductPicker(false)}
            />
          )}
          {!localPreview || !draft ? (
            <div className="space-y-3 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full aspect-[9/16] max-h-[55vh] rounded-3xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-3 text-white/60 hover:bg-white/[0.04] hover:border-white/25 transition-colors"
              >
                <Upload className="w-8 h-8" />
                <span className="text-sm">Choisir une vidéo</span>
                <span className="text-xs text-white/40">mp4 / webm — max 200 Mo, 10 min</span>
              </button>
              <div className="flex items-center justify-center gap-2 text-[11px] text-white/40">
                <span className="h-px w-10 bg-white/15" />
                ou démarre avec
                <span className="h-px w-10 bg-white/15" />
              </div>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="w-full rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] py-4 flex items-center justify-center gap-2 text-white"
                data-testid="empty-state-camera"
              >
                <Camera className="w-5 h-5" />
                <span className="text-sm">Filmer avec la caméra</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 max-w-6xl mx-auto">
              {/* Colonne gauche : preview + timeline + outils */}
              <div className="flex-1 space-y-3 min-w-0">
                {/* Preview vidéo */}
                <div className="relative w-full bg-black rounded-3xl overflow-hidden flex items-center justify-center">
                  <div
                    ref={previewWrapRef}
                    className="relative w-full max-h-[50vh]"
                    style={{ aspectRatio: '9 / 16' }}
                  >
                    <video
                      ref={videoRef}
                      src={previewVideoSrc || undefined}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      style={previewVideoFilterCss ? { filter: previewVideoFilterCss } : undefined}
                      onLoadedMetadata={onLoadedMetadata}
                      onTimeUpdate={onTimeUpdate}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      data-testid="editor-preview-video"
                    />
                    <VideoTextOverlay
                      texts={draft.texts}
                      currentTimeSource={currentTime}
                      trim={draft.trim ?? null}
                    />
                    {/* Bouton play overlay au centre */}
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center"
                      aria-label={isPlaying ? 'Pause' : 'Lecture'}
                    >
                      {!isPlaying && (
                        <div className="w-14 h-14 rounded-full bg-black/45 backdrop-blur-md border border-white/15 flex items-center justify-center">
                          <Play className="w-7 h-7 text-white ml-0.5" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Talk2Me #421 — Timeline multi-clips */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3">
                  <VideoClipsTimeline
                    clips={clips}
                    transitions={transitions}
                    selectedId={selectedClipId}
                    onSelect={(id) => selectClip(id)}
                    onRequestAdd={() => setShowAddDialog(true)}
                    onRemove={(id) => removeClip(id)}
                    onReorder={(ids) => reorderClips(ids)}
                    onTransitionClick={(idx) => {
                      const cur = transitions[idx];
                      const next =
                        cur?.type === 'cut'
                          ? { type: 'fade' as const, duration_ms: 300 }
                          : { type: 'cut' as const, duration_ms: 0 };
                      setTransitionAt(idx, next);
                    }}
                  />
                </div>

                {/* Timeline du clip sélectionné (trim individuel) */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide text-white/40">
                      {isMultiClips
                        ? `Trim clip ${activeClipIndex + 1}/${clips.length}`
                        : 'Trim & cover'}
                    </span>
                  </div>
                  <VideoTimeline
                    duration={
                      isMultiClips && activeClip
                        ? activeClip.duration_original_sec
                        : draft.duration_s ?? 0
                    }
                    currentTime={currentTime}
                    trim={
                      isMultiClips && activeClip
                        ? { start_s: activeClip.trim_start_sec, end_s: activeClip.trim_end_sec }
                        : draft.trim ?? null
                    }
                    coverTime={
                      isMultiClips
                        ? null
                        : typeof draft.cover_time_s === 'number'
                        ? (draft.trim ? draft.trim.start_s : 0) + draft.cover_time_s
                        : null
                    }
                    onSeek={onSeek}
                    onTrimChange={(s, e) => {
                      if (isMultiClips && activeClip) {
                        updateClip(activeClip.id, {
                          trim_start_sec: s,
                          trim_end_sec: e,
                        });
                      } else {
                        setTrim(s, e);
                      }
                    }}
                    onTrimCommit={(s, e) => {
                      if (isMultiClips && activeClip) {
                        updateClip(activeClip.id, {
                          trim_start_sec: s,
                          trim_end_sec: e,
                        });
                      } else {
                        setTrim(s, e);
                      }
                    }}
                    onCoverChange={(t) => {
                      if (isMultiClips) return;
                      const final = draft.trim ? Math.max(0, t - draft.trim.start_s) : t;
                      setCoverTime(final);
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-white/80 text-[12px] flex items-center gap-1.5"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" /> Lecture
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddTrimAtCurrent('start')}
                      className="px-3 py-1.5 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 text-[12px] flex items-center gap-1.5"
                      title="Définit le début du trim à la position courante"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      Début ici
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddTrimAtCurrent('end')}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[12px] flex items-center gap-1.5"
                      title="Définit la fin du trim à la position courante"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      Fin ici
                    </button>
                    {draft.trim && (
                      <button
                        type="button"
                        onClick={() => clearTrim()}
                        className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-white/70 text-[12px]"
                      >
                        Annuler le trim
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleUseCurrentAsCover}
                      className="px-3 py-1.5 rounded-full bg-yellow-500/15 border border-yellow-400/30 text-yellow-100 text-[12px] flex items-center gap-1.5"
                      title="Utilise la frame courante comme couverture"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Cover ici
                    </button>
                  </div>
                  <div className="text-[11px] text-white/45 mt-2">
                    {trimDuration > 0
                      ? `Durée finale : ${trimDuration.toFixed(1)}s`
                      : '—'}
                    {typeof draft.cover_time_s === 'number' &&
                      ` · cover @${draft.cover_time_s.toFixed(1)}s (post-trim)`}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>
                    {file?.name} · {(file!.size / 1024 / 1024).toFixed(1)} Mo
                    {draft.duration_s ? ` · ${draft.duration_s.toFixed(1)}s` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-white/60 hover:text-white underline"
                  >
                    Changer
                  </button>
                </div>

                {/* Talk2Me #420 — Onglets outils (Texts / Musique) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5" data-testid="tool-tabs">
                    <button
                      type="button"
                      onClick={() => setToolTab('texts')}
                      className={
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' +
                        (toolTab === 'texts'
                          ? 'bg-white/[0.10] border border-white/15 text-white'
                          : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')
                      }
                      data-testid="tool-tab-texts"
                    >
                      <Type className="w-3.5 h-3.5" />
                      Textes
                      {draft.texts.length > 0 && (
                        <span className="ml-1 text-[10px] text-white/55">
                          ({draft.texts.length})
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolTab('music')}
                      className={
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' +
                        (toolTab === 'music'
                          ? 'bg-white/[0.10] border border-white/15 text-white'
                          : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')
                      }
                      data-testid="tool-tab-music"
                    >
                      <span aria-hidden="true">🎵</span>
                      Musique
                      {draft.audio && (
                        <span
                          className="ml-1 w-1.5 h-1.5 rounded-full bg-violet-300"
                          aria-label="musique sélectionnée"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolTab('filters')}
                      className={
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' +
                        (toolTab === 'filters'
                          ? 'bg-white/[0.10] border border-white/15 text-white'
                          : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')
                      }
                      data-testid="tool-tab-filters"
                    >
                      <span aria-hidden="true">🎨</span>
                      Filtres
                      {clips.some((c) => c.filter && c.filter !== 'none') && (
                        <span
                          className="ml-1 w-1.5 h-1.5 rounded-full bg-violet-300"
                          aria-label="filtre actif"
                        />
                      )}
                    </button>
                  </div>

                  {toolTab === 'texts' && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">
                        Textes overlay
                      </div>
                      <AddVideoTextRow
                        duration={draft.duration_s ?? 0}
                        currentTime={currentTime - (draft.trim?.start_s ?? 0)}
                        onAdd={(content, position, start_s, end_s) =>
                          addText(content, position, { start_s, end_s })
                        }
                      />
                      {draft.texts.length > 0 && (
                        <div className="space-y-1 mt-1">
                          {draft.texts.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/8 px-3 py-1.5 text-[12px] text-white/85"
                            >
                              <span className="truncate">
                                <span className="text-white/40 mr-1.5">[{t.position}]</span>
                                {t.content}
                                {typeof t.start_s === 'number' || typeof t.end_s === 'number' ? (
                                  <span className="text-white/40 ml-1.5">
                                    ({typeof t.start_s === 'number' ? `${t.start_s.toFixed(1)}s` : '0s'}→
                                    {typeof t.end_s === 'number' ? `${t.end_s.toFixed(1)}s` : 'fin'})
                                  </span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeText(t.id)}
                                className="text-white/50 hover:text-white"
                                aria-label="Supprimer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {toolTab === 'music' && (
                    <div className="space-y-3">
                      {/* #422 — Music-Hub : disque vinyle rotatif overlay */}
                      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[12px] text-white/70">
                            🎵 Music-Hub (overlay disque rotatif)
                          </div>
                          <button
                            type="button"
                            onClick={() => setMusicPickerOpen(true)}
                            className="text-[11px] text-violet-200 bg-violet-500/15 border border-violet-400/30 rounded-full px-2.5 py-1 hover:bg-violet-500/25"
                          >
                            {attachedMusic ? 'Changer' : 'Ajouter'}
                          </button>
                        </div>
                        {attachedMusic ? (
                          <>
                          <div className="flex items-center gap-2.5">
                            {attachedMusic.thumbnail_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={attachedMusic.thumbnail_url}
                                alt=""
                                className="w-10 h-10 rounded-md object-cover bg-white/5"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] text-white truncate">
                                {attachedMusic.title}
                              </div>
                              <div className="text-[10px] text-white/50 truncate">
                                {attachedMusic.author?.name ?? ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAttachedMusic(null)}
                              className="text-[11px] text-white/60 hover:text-white"
                              aria-label="Retirer la musique"
                            >
                              Retirer
                            </button>
                          </div>
                          <MusicExtractPicker
                            music={attachedMusic}
                            videoDurationS={
                              clips.length > 0
                                ? totalClipsDuration(clips)
                                : draft.trim
                                  ? draft.trim.end_s - draft.trim.start_s
                                  : draft.duration_s ?? 0
                            }
                            startSec={
                              ((attachedMusic.meta as { start_sec?: number } | undefined)
                                ?.start_sec) ?? 0
                            }
                            onChange={(start) =>
                              setAttachedMusic((prev) =>
                                prev
                                  ? { ...prev, meta: { ...(prev.meta || {}), start_sec: start } }
                                  : prev
                              )
                            }
                          />
                          <MusicMixer
                            videoVolume={
                              ((attachedMusic.meta as { video_volume?: number } | undefined)
                                ?.video_volume) ?? 1
                            }
                            musicVolume={
                              ((attachedMusic.meta as { volume?: number } | undefined)?.volume) ?? 0.3
                            }
                            onChange={(vv, mv) =>
                              setAttachedMusic((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      meta: { ...(prev.meta || {}), video_volume: vv, volume: mv },
                                    }
                                  : prev
                              )
                            }
                          />
                          </>
                        ) : (
                          <div className="text-[11px] text-white/40">
                            Aucune musique attachée. Le disque ne s'affichera pas.
                          </div>
                        )}
                      </div>
                      {/* Picker local existant (mix audio sur la vidéo) */}
                      <AudioPickerTab
                        videoUrl={serverUrl}
                        videoDurationS={
                          clips.length > 0
                            ? totalClipsDuration(clips)
                            : draft.trim
                            ? draft.trim.end_s - draft.trim.start_s
                            : draft.duration_s ?? 0
                        }
                        onPreview={(url) => setAudioPreviewUrl(url)}
                      />
                    </div>
                  )}

                  {toolTab === 'filters' && (
                    <VideoFiltersTab
                      clips={clips}
                      selectedClipId={selectedClipId}
                      onApplyToSelected={(id, f) => setClipFilter(id, f)}
                      onApplyToAll={(f) => setAllClipsFilter(f)}
                    />
                  )}
                </div>

                {/* Metadata */}
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">
                      Titre
                    </div>
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
                          if (Array.isArray(val))
                            setHashtags(
                              val.filter((x): x is string => typeof x === 'string')
                            );
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
                  mode="card_editor_video"
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
                <span className="text-white/80 text-sm">
                  Aperçu de la card
                  {audioPreviewUrl && (
                    <span className="ml-1.5 text-[10px] text-violet-300">
                      • avec musique
                    </span>
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
                    /* Si on a généré un preview ffmpeg avec audio, on l'utilise.
                       Sinon fallback sur le localPreview (sans audio mixée). */
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

        {/* Loader baking */}
        {bakingMessage && publishing && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none">
            <Loader2 className="w-8 h-8 text-red-300 animate-spin" />
            <div className="text-white/85 text-sm">{bakingMessage}</div>
            <div className="text-white/40 text-[11px]">Cela peut prendre 10 à 60 secondes.</div>
          </div>
        )}

        {/* Talk2Me #421 — Add clip dialog (Caméra / Galerie) */}
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
                  onClick={() => {
                    setShowAddDialog(false);
                    setShowCamera(true);
                  }}
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
                  if (f) void handleGalleryFile(f);
                  // reset pour pouvoir re-uploader le même fichier
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

        {/* Talk2Me #421 — Camera modal */}
        <CameraCaptureModal
          open={showCamera}
          onClose={() => setShowCamera(false)}
          onClipReady={(url, dur, size) => void handleCameraClipReady(url, dur, size)}
        />

        {/* Talk2Me #422 — Music-Hub picker (bottom-sheet) */}
        <MusicPickerSheet
          open={musicPickerOpen}
          onClose={() => setMusicPickerOpen(false)}
          onSelect={(card) => setAttachedMusic(card)}
        />
      </motion.div>
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/* AddVideoTextRow — ajout manuel d'un texte overlay (avec fenêtre temps).  */
/* ----------------------------------------------------------------------- */

function AddVideoTextRow({
  duration,
  currentTime,
  onAdd,
}: {
  duration: number;
  currentTime: number;
  onAdd: (
    content: string,
    position: TextPos,
    start_s?: number,
    end_s?: number
  ) => void;
}) {
  const [val, setVal] = useState('');
  const [pos, setPos] = useState<TextPos>('top');
  const [withRange, setWithRange] = useState(false);

  const submit = () => {
    const t = val.trim();
    if (!t) return;
    if (withRange) {
      const s = Math.max(0, currentTime);
      const e = Math.max(s + 1, Math.min(s + 3, Math.max(s + 1, duration)));
      onAdd(t.slice(0, 60), pos, s, e);
    } else {
      onAdd(t.slice(0, 60), pos);
    }
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
      <label className="flex items-center gap-1 text-[11px] text-white/60 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={withRange}
          onChange={(e) => setWithRange(e.target.checked)}
          className="accent-red-500"
        />
        3s
      </label>
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
/* ManualGenButton (clone de l'image editor, mais on inclut le snapshot     */
/* vidéo complet pour que /generate-metadata sache contextualiser).         */
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
            texts: draft.texts.map((t) => ({
              content: t.content,
              position: t.position,
            })),
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
