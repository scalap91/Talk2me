/**
 * /home/ubuntu/talktome/lib/card-draft-store.ts
 *
 * Zustand store pour le draft de Card en cours d'édition par l'éditeur IA.
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - IA propose, humain décide
 *  - Undo/Redo via stack de snapshots
 *  - Modifs IA + modifs manuelles partagent le même draft
 *  - Pas de publication sans validation explicite
 *
 * Phase B (2026-06-04) : ajout du type='video' avec trim / cover_time / texts
 * (overlays avec start_s/end_s pour visibilité timeline).
 *
 * Talk2Me #421 (2026-06-05) : passage en MULTI-CLIPS.
 *  - Nouvelle abstraction VideoClip = un segment (upload/caméra/galerie)
 *    avec trim + filtre propres.
 *  - `clips: VideoClip[]` remplace conceptuellement `source_url` + `trim`.
 *  - Compat ascendante : si un draft hérité contient `source_url` + `trim`,
 *    on l'interprète comme `clips: [{ source_url, trim_start_sec, trim_end_sec }]`
 *    via `ensureClipsCompat()`.
 *  - Transitions entre clip[i] et clip[i+1] : MVP `cut` / `fade`.
 */
'use client';

import { create } from 'zustand';
import type { FilterPreset } from './video-filters';

export type CropRatio = 'square' | 'vertical' | 'horizontal' | 'original';
export type FilterKind = 'none' | 'auto' | 'bright' | 'warm' | 'cold' | 'soft';
export type TextPos = 'top' | 'center' | 'bottom';

export interface DraftTextOverlay {
  id: string;
  content: string;
  position: TextPos;
  /** x/y en % (0–100) du conteneur preview (drag manuel libre, image uniquement). */
  x_pct: number;
  y_pct: number;
  fontSize: number; // px
  color: string;
  /** Vidéo : début d'affichage du texte (s). null/undefined = depuis le début. */
  start_s?: number | null;
  /** Vidéo : fin d'affichage du texte (s). null/undefined = jusqu'à la fin. */
  end_s?: number | null;
}

export interface VideoTrim {
  start_s: number;
  end_s: number;
}

/**
 * Talk2Me #421 — un clip vidéo dans la timeline multi-clips.
 *
 * `source_url` : URL servable (upload, caméra-recorded, galerie).
 * `trim_start_sec/trim_end_sec` : sous-segment utilisé dans le clip source.
 * `duration_original_sec` : durée totale du fichier source (mesurée HTML5).
 * `filter` : preset couleur appliqué à CE clip uniquement (null = aucun /
 *            fallback sur draft.filter global si défini).
 * `thumbnail_url` : mini-thumb (première frame post-trim) pour la timeline.
 *                   Optionnel — la timeline peut fallback sur le poster vidéo.
 */
export interface VideoClip {
  id: string;
  source_url: string;
  trim_start_sec: number;
  trim_end_sec: number;
  duration_original_sec: number;
  filter?: FilterPreset | null;
  thumbnail_url?: string | null;
}

/**
 * Talk2Me #421 — transition entre clip[i] et clip[i+1].
 * MVP : 'cut' (instantané, 0 ms) ou 'fade' (200–500 ms, xfade ffmpeg).
 * Plus tard : slide, wipe, zoom (#422+).
 */
export interface Transition {
  type: 'cut' | 'fade';
  /** Durée transition (ms). 0 pour cut, 200-500 pour fade. */
  duration_ms: number;
}

/**
 * Talk2Me #420 — bande son ajoutée à une VideoCard.
 *
 * Source = 'lib' (catalogue /audio-lib/) OU 'upload' (l'user a uploadé un mp3).
 * audio_url : URL servable (que ce soit /audio-lib/... ou /uploads/...).
 * Volumes : 0–100, mappés ffmpeg ÷100.
 * offset_sec : décalage début musique (positif = musique commence X s après début vidéo).
 */
export interface VideoAudio {
  source: 'lib' | 'upload';
  audio_id?: string | null;        // id de catalogue si source='lib'
  audio_name?: string | null;      // nom affichable
  audio_url: string;               // URL servable
  audio_duration_s?: number | null;
  video_volume: number;            // 0–100
  audio_volume: number;            // 0–100
  audio_offset_sec: number;        // 0+
}

export interface CardDraft {
  type: 'image' | 'video';
  /**
   * URL publique de l'upload (ex /uploads/uuid.jpg).
   * Pour les VideoDraft #421 multi-clips, source_url reste rempli pour compat
   * (= URL du clip principal, généralement le clip[0]) mais la source de
   * vérité est `clips[]`.
   */
  source_url: string;
  crop: CropRatio;
  filter: FilterKind;
  texts: DraftTextOverlay[];
  title: string;
  description: string;
  hashtags: string[];
  /** Image cover (= image elle-même pour ImageCard, frame pour vidéo). */
  cover_url: string | null;

  // ----- Champs vidéo (présents si type='video') -----
  /**
   * Durée totale source (s). null tant que la <video> n'a pas chargé.
   * @deprecated #421 — pour multi-clips, utilise la somme des durations clip.
   *                   Conservé pour compat ascendante draft 1-clip.
   */
  duration_s?: number | null;
  /**
   * Trim défini par user/IA. undefined = pas de trim.
   * @deprecated #421 — pour multi-clips, le trim est par-clip via VideoClip.
   *                   Conservé pour compat ascendante.
   */
  trim?: VideoTrim | null;
  /** Timestamp de la frame cover (en s, dans la VIDÉO FINALE concaténée). */
  cover_time_s?: number | null;
  /** Bande son ajoutée (Talk2Me #420). null = vidéo sans musique ajoutée. */
  audio?: VideoAudio | null;
  // ----- Talk2Me #421 multi-clips ------------------------------------
  /**
   * Array ordonné de clips. Ordre = ordre de concaténation finale.
   * Si vide (compat draft hérité), on retombe sur source_url + trim via
   * `ensureClipsCompat()`.
   */
  clips?: VideoClip[];
  /**
   * Transitions entre clips. transitions[i] = transition entre clip[i] et
   * clip[i+1]. Longueur attendue = clips.length - 1.
   * Si manquant, on infère cut.
   */
  transitions?: Transition[];
  /** Index du clip actuellement sélectionné dans l'UI (pour édition). */
  selected_clip_id?: string | null;
}

export interface DraftChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  /** Texte décrivant l'opération appliquée (ex "Crop vertical appliqué"). */
  actions?: string[];
  created_at: number;
}

interface CardDraftState {
  draft: CardDraft | null;
  /** Stack snapshots passés (undo). Top = juste avant la dernière modif. */
  past: CardDraft[];
  /** Stack snapshots futurs (redo). */
  future: CardDraft[];
  /** Historique conversation IA pour le panel éditeur. */
  chat: DraftChatMessage[];
  /** True pendant un call IA en cours. */
  aiLoading: boolean;

  // Lifecycle
  initDraft: (type: 'image' | 'video', sourceUrl: string) => void;
  resetDraft: () => void;

  // Mutations communes (chaque mut push past)
  setCrop: (crop: CropRatio) => void;
  setFilter: (filter: FilterKind) => void;
  addText: (
    content: string,
    position?: TextPos,
    extras?: Partial<Pick<DraftTextOverlay, 'start_s' | 'end_s'>>
  ) => string;
  updateText: (id: string, patch: Partial<DraftTextOverlay>) => void;
  removeText: (id: string) => void;
  setTitle: (title: string) => void;
  setDescription: (desc: string) => void;
  setHashtags: (tags: string[]) => void;
  addHashtag: (tag: string) => void;
  removeHashtag: (tag: string) => void;

  // Mutations vidéo
  setDuration: (duration_s: number) => void;
  setTrim: (start_s: number, end_s: number) => void;
  clearTrim: () => void;
  setCoverTime: (time_s: number) => void;

  // ----- Talk2Me #421 multi-clips ----------------------------------
  /** Ajoute un nouveau clip en fin de timeline et retourne son id. */
  addClip: (clip: Omit<VideoClip, 'id'> & { id?: string }) => string;
  /** Remplace les clips (utilisé pour reorder drag & drop). */
  reorderClips: (orderedIds: string[]) => void;
  /** Supprime un clip + sa transition. */
  removeClip: (clipId: string) => void;
  /** Patch un clip (trim, filter, thumbnail). */
  updateClip: (clipId: string, patch: Partial<Omit<VideoClip, 'id'>>) => void;
  /** Sélectionne un clip pour édition ciblée. null = pas de sélection. */
  selectClip: (clipId: string | null) => void;
  /** Change le filtre d'UN clip. */
  setClipFilter: (clipId: string, filter: FilterPreset | null) => void;
  /** Change le filtre de TOUS les clips. */
  setAllClipsFilter: (filter: FilterPreset | null) => void;
  /** Set la transition entre clip[i] et clip[i+1]. */
  setTransitionAt: (index: number, transition: Transition) => void;

  // Mutations audio (#420)
  setAudio: (audio: VideoAudio | null) => void;
  updateAudio: (patch: Partial<VideoAudio>) => void;
  clearAudio: () => void;

  // History
  undo: () => void;
  redo: () => void;

  // Chat
  pushChatUser: (text: string) => void;
  pushChatAI: (text: string, actions?: string[]) => void;
  setAiLoading: (b: boolean) => void;
}

const POSITION_TO_Y: Record<TextPos, number> = {
  top: 10,
  center: 50,
  bottom: 85,
};

function cloneDraft(d: CardDraft): CardDraft {
  return {
    ...d,
    texts: d.texts.map((t) => ({ ...t })),
    hashtags: [...d.hashtags],
    trim: d.trim ? { ...d.trim } : d.trim,
    audio: d.audio ? { ...d.audio } : d.audio,
    clips: d.clips ? d.clips.map((c) => ({ ...c })) : d.clips,
    transitions: d.transitions ? d.transitions.map((t) => ({ ...t })) : d.transitions,
  };
}

/* ----------------------------------------------------------------------- */
/* Helpers #421 multi-clips                                                  */
/* ----------------------------------------------------------------------- */

function newClipId(): string {
  return `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Transition par défaut entre 2 clips ajoutés (cut instantané). */
function defaultTransition(): Transition {
  return { type: 'cut', duration_ms: 0 };
}

/**
 * Garantit que la liste de clips est cohérente avec le draft :
 *  - Si clips existe et non vide → on garde.
 *  - Sinon (compat draft hérité) → on construit clips=[{ source_url, trim }].
 * Retourne (clips, transitions) à utiliser. NE MUTE PAS le draft.
 */
export function ensureClipsCompat(d: CardDraft): {
  clips: VideoClip[];
  transitions: Transition[];
} {
  if (d.clips && d.clips.length > 0) {
    const expected = Math.max(0, d.clips.length - 1);
    const tr =
      d.transitions && d.transitions.length === expected
        ? d.transitions
        : Array.from({ length: expected }, () => defaultTransition());
    return { clips: d.clips, transitions: tr };
  }
  // Compat : un seul clip dérivé de source_url + trim
  if (d.type === 'video' && d.source_url) {
    const dur = typeof d.duration_s === 'number' && d.duration_s > 0 ? d.duration_s : 0;
    const start = d.trim?.start_s ?? 0;
    const end = d.trim?.end_s ?? dur;
    const single: VideoClip = {
      id: newClipId(),
      source_url: d.source_url,
      trim_start_sec: Math.max(0, start),
      trim_end_sec: Math.max(start + 0.1, end || start + 0.1),
      duration_original_sec: dur,
      filter: null,
      thumbnail_url: null,
    };
    return { clips: [single], transitions: [] };
  }
  return { clips: [], transitions: [] };
}

/** Durée totale concaténée des clips (somme des sous-segments trimmés). */
export function totalClipsDuration(clips: VideoClip[]): number {
  let total = 0;
  for (const c of clips) {
    total += Math.max(0, c.trim_end_sec - c.trim_start_sec);
  }
  return total;
}

function withSnapshot<T extends CardDraftState>(
  set: (fn: (s: T) => Partial<T>) => void,
  get: () => T,
  patch: (d: CardDraft) => Partial<CardDraft>
) {
  const cur = get().draft;
  if (!cur) return;
  const before = cloneDraft(cur);
  const next: CardDraft = { ...cloneDraft(cur), ...patch(cur) };
  // @ts-expect-error - partial typing
  set((s) => ({
    draft: next,
    past: [...s.past.slice(-49), before],
    future: [],
  }));
}

/** Mutation sans snapshot (ex: duration_s mesuré côté HTML5, pas un undo logique). */
function withoutSnapshot<T extends CardDraftState>(
  set: (fn: (s: T) => Partial<T>) => void,
  get: () => T,
  patch: (d: CardDraft) => Partial<CardDraft>
) {
  const cur = get().draft;
  if (!cur) return;
  const next: CardDraft = { ...cloneDraft(cur), ...patch(cur) };
  // @ts-expect-error - partial typing
  set(() => ({ draft: next }));
}

function normalizeHashtag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, '').toLowerCase();
  // garde lettres/chiffres/underscore/accents
  const safe = cleaned.replace(/[^\p{L}\p{N}_]/gu, '');
  return safe;
}

export const useCardDraftStore = create<CardDraftState>((set, get) => ({
  draft: null,
  past: [],
  future: [],
  chat: [],
  aiLoading: false,

  initDraft: (type, sourceUrl) =>
    set({
      draft: {
        type,
        source_url: sourceUrl,
        crop: 'original',
        filter: 'none',
        texts: [],
        title: '',
        description: '',
        hashtags: [],
        cover_url: type === 'image' ? sourceUrl : null,
        duration_s: type === 'video' ? null : undefined,
        trim: type === 'video' ? null : undefined,
        cover_time_s: type === 'video' ? 0 : undefined,
        audio: type === 'video' ? null : undefined,
        // Talk2Me #421 — multi-clips : clip initial dérivé du sourceUrl si vidéo.
        clips:
          type === 'video' && sourceUrl
            ? [
                {
                  id: newClipId(),
                  source_url: sourceUrl,
                  trim_start_sec: 0,
                  trim_end_sec: 0, // sera mis à jour à onLoadedMetadata
                  duration_original_sec: 0,
                  filter: null,
                  thumbnail_url: null,
                },
              ]
            : type === 'video'
            ? []
            : undefined,
        transitions: type === 'video' ? [] : undefined,
        selected_clip_id: type === 'video' ? null : undefined,
      },
      past: [],
      future: [],
      chat: [],
      aiLoading: false,
    }),

  resetDraft: () =>
    set({ draft: null, past: [], future: [], chat: [], aiLoading: false }),

  setCrop: (crop) =>
    withSnapshot(set as any, get as any, () => ({ crop })),

  setFilter: (filter) =>
    withSnapshot(set as any, get as any, () => ({ filter })),

  addText: (content, position = 'center', extras) => {
    const cur = get().draft;
    if (!cur) return '';
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newText: DraftTextOverlay = {
      id,
      content,
      position,
      x_pct: 50,
      y_pct: POSITION_TO_Y[position],
      fontSize: 28,
      color: '#ffffff',
      ...(extras?.start_s !== undefined ? { start_s: extras.start_s } : {}),
      ...(extras?.end_s !== undefined ? { end_s: extras.end_s } : {}),
    };
    withSnapshot(set as any, get as any, (d) => ({
      texts: [...d.texts, newText],
    }));
    return id;
  },

  updateText: (id, patch) =>
    withSnapshot(set as any, get as any, (d) => ({
      texts: d.texts.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              ...(patch.position
                ? { y_pct: POSITION_TO_Y[patch.position] }
                : {}),
            }
          : t
      ),
    })),

  removeText: (id) =>
    withSnapshot(set as any, get as any, (d) => ({
      texts: d.texts.filter((t) => t.id !== id),
    })),

  setTitle: (title) =>
    withSnapshot(set as any, get as any, () => ({ title: title.slice(0, 80) })),

  setDescription: (description) =>
    withSnapshot(set as any, get as any, () => ({
      description: description.slice(0, 400),
    })),

  setHashtags: (tags) => {
    const cleaned = tags
      .map(normalizeHashtag)
      .filter((t) => t.length > 0)
      .slice(0, 15);
    const uniq = Array.from(new Set(cleaned));
    withSnapshot(set as any, get as any, () => ({ hashtags: uniq }));
  },

  addHashtag: (tag) => {
    const t = normalizeHashtag(tag);
    if (!t) return;
    withSnapshot(set as any, get as any, (d) => {
      if (d.hashtags.includes(t)) return {};
      return { hashtags: [...d.hashtags, t].slice(0, 15) };
    });
  },

  removeHashtag: (tag) => {
    const t = normalizeHashtag(tag);
    withSnapshot(set as any, get as any, (d) => ({
      hashtags: d.hashtags.filter((x) => x !== t),
    }));
  },

  // ----- Vidéo -----
  setDuration: (duration_s) => {
    // pas un événement undo : c'est une mesure du média
    withoutSnapshot(set as any, get as any, (d) => {
      const dur = duration_s > 0 ? duration_s : 0;
      // #421 — propage la durée au premier clip si pas encore renseigné
      // (cas commun : init via initDraft, puis HTML5 charge la durée).
      let clipsPatch: VideoClip[] | undefined = d.clips;
      if (d.clips && d.clips.length > 0) {
        const first = d.clips[0];
        if (
          (first.duration_original_sec || 0) <= 0 ||
          first.trim_end_sec <= 0
        ) {
          clipsPatch = d.clips.map((c, i) =>
            i === 0
              ? {
                  ...c,
                  duration_original_sec: dur,
                  trim_end_sec: c.trim_end_sec > 0 ? c.trim_end_sec : dur,
                }
              : c
          );
        }
      }
      return { duration_s: dur, ...(clipsPatch !== d.clips ? { clips: clipsPatch } : {}) };
    });
  },

  setTrim: (start_s, end_s) => {
    const cur = get().draft;
    if (!cur) return;
    const max = cur.duration_s && cur.duration_s > 0 ? cur.duration_s : end_s;
    const s = Math.max(0, Math.min(start_s, max));
    const e = Math.max(s + 0.1, Math.min(end_s, max));
    withSnapshot(set as any, get as any, () => ({ trim: { start_s: s, end_s: e } }));
  },

  clearTrim: () =>
    withSnapshot(set as any, get as any, () => ({ trim: null })),

  setCoverTime: (time_s) => {
    const cur = get().draft;
    if (!cur) return;
    const max = cur.duration_s && cur.duration_s > 0 ? cur.duration_s : time_s;
    const t = Math.max(0, Math.min(time_s, max));
    withSnapshot(set as any, get as any, () => ({ cover_time_s: t }));
  },

  // ----- Talk2Me #421 multi-clips ----------------------------------
  addClip: (clip) => {
    const cur = get().draft;
    if (!cur) return '';
    const id = clip.id || newClipId();
    const newClip: VideoClip = {
      id,
      source_url: clip.source_url,
      trim_start_sec: Math.max(0, clip.trim_start_sec || 0),
      trim_end_sec: Math.max(
        (clip.trim_start_sec || 0) + 0.1,
        clip.trim_end_sec || clip.duration_original_sec || 0
      ),
      duration_original_sec: Math.max(0, clip.duration_original_sec || 0),
      filter: clip.filter ?? null,
      thumbnail_url: clip.thumbnail_url ?? null,
    };
    withSnapshot(set as any, get as any, (d) => {
      const existing = d.clips ?? [];
      const newClips = [...existing, newClip];
      // Une transition par défaut (cut) à insérer entre l'avant-dernier et le nouveau.
      const existingTransitions = d.transitions ?? [];
      const newTransitions =
        existing.length === 0
          ? existingTransitions
          : [...existingTransitions, defaultTransition()];
      // Si c'est le tout premier clip, on synchronise aussi source_url
      const sourcePatch =
        existing.length === 0 ? { source_url: clip.source_url } : {};
      return {
        clips: newClips,
        transitions: newTransitions,
        selected_clip_id: id,
        ...sourcePatch,
      };
    });
    return id;
  },

  reorderClips: (orderedIds) => {
    withSnapshot(set as any, get as any, (d) => {
      const clips = d.clips ?? [];
      if (clips.length === 0) return {};
      const byId = new Map(clips.map((c) => [c.id, c]));
      const reordered: VideoClip[] = [];
      for (const id of orderedIds) {
        const c = byId.get(id);
        if (c) reordered.push(c);
      }
      // Garde tout clip absent de orderedIds en fin (safety).
      for (const c of clips) {
        if (!orderedIds.includes(c.id)) reordered.push(c);
      }
      // Recalcule transitions : on garde l'ancienne config quand possible
      // sinon défaut. MVP : on réinitialise toutes à default (#421 reorder
      // = on suppose que l'user re-définit ses transitions).
      const newTransitions: Transition[] = Array.from(
        { length: Math.max(0, reordered.length - 1) },
        () => defaultTransition()
      );
      const sourcePatch =
        reordered.length > 0 ? { source_url: reordered[0].source_url } : {};
      return {
        clips: reordered,
        transitions: newTransitions,
        ...sourcePatch,
      };
    });
  },

  removeClip: (clipId) => {
    withSnapshot(set as any, get as any, (d) => {
      const clips = d.clips ?? [];
      const idx = clips.findIndex((c) => c.id === clipId);
      if (idx < 0) return {};
      const newClips = clips.filter((c) => c.id !== clipId);
      const transitions = d.transitions ?? [];
      const newTransitions = transitions.filter((_, i) => {
        // On supprime la transition AVANT le clip retiré si possible, sinon APRÈS.
        if (idx === 0) return i !== 0; // pas de transition avant clip[0]
        return i !== idx - 1;
      });
      const sourcePatch =
        newClips.length > 0
          ? { source_url: newClips[0].source_url }
          : { source_url: '' };
      const selectedPatch =
        d.selected_clip_id === clipId ? { selected_clip_id: null } : {};
      return {
        clips: newClips,
        transitions: newTransitions,
        ...sourcePatch,
        ...selectedPatch,
      };
    });
  },

  updateClip: (clipId, patch) => {
    withSnapshot(set as any, get as any, (d) => {
      const clips = d.clips ?? [];
      const newClips = clips.map((c) => {
        if (c.id !== clipId) return c;
        const merged: VideoClip = { ...c, ...patch };
        // Clamp trim
        if (typeof merged.duration_original_sec === 'number' && merged.duration_original_sec > 0) {
          if (merged.trim_start_sec < 0) merged.trim_start_sec = 0;
          if (merged.trim_end_sec > merged.duration_original_sec)
            merged.trim_end_sec = merged.duration_original_sec;
          if (merged.trim_end_sec - merged.trim_start_sec < 0.1)
            merged.trim_end_sec = Math.min(
              merged.trim_start_sec + 0.1,
              merged.duration_original_sec
            );
        }
        return merged;
      });
      return { clips: newClips };
    });
  },

  selectClip: (clipId) =>
    withoutSnapshot(set as any, get as any, () => ({ selected_clip_id: clipId })),

  setClipFilter: (clipId, filter) => {
    withSnapshot(set as any, get as any, (d) => {
      const clips = d.clips ?? [];
      return {
        clips: clips.map((c) => (c.id === clipId ? { ...c, filter: filter ?? null } : c)),
      };
    });
  },

  setAllClipsFilter: (filter) => {
    withSnapshot(set as any, get as any, (d) => {
      const clips = d.clips ?? [];
      return {
        clips: clips.map((c) => ({ ...c, filter: filter ?? null })),
      };
    });
  },

  setTransitionAt: (index, transition) => {
    withSnapshot(set as any, get as any, (d) => {
      const transitions = [...(d.transitions ?? [])];
      const expected = Math.max(0, (d.clips ?? []).length - 1);
      // Pad si besoin
      while (transitions.length < expected) transitions.push(defaultTransition());
      if (index < 0 || index >= expected) return {};
      transitions[index] = {
        type: transition.type,
        duration_ms: Math.max(0, Math.min(2000, transition.duration_ms || 0)),
      };
      return { transitions };
    });
  },

  // ----- Audio (#420) -----
  setAudio: (audio) => {
    withSnapshot(set as any, get as any, () =>
      audio
        ? {
            audio: {
              source: audio.source,
              audio_id: audio.audio_id ?? null,
              audio_name: audio.audio_name ?? null,
              audio_url: audio.audio_url,
              audio_duration_s: audio.audio_duration_s ?? null,
              video_volume:
                typeof audio.video_volume === 'number'
                  ? Math.max(0, Math.min(100, audio.video_volume))
                  : 80,
              audio_volume:
                typeof audio.audio_volume === 'number'
                  ? Math.max(0, Math.min(100, audio.audio_volume))
                  : 60,
              audio_offset_sec:
                typeof audio.audio_offset_sec === 'number'
                  ? Math.max(0, audio.audio_offset_sec)
                  : 0,
            },
          }
        : { audio: null }
    );
  },

  updateAudio: (patch) =>
    withSnapshot(set as any, get as any, (d) => {
      if (!d.audio) return {};
      const next: VideoAudio = { ...d.audio, ...patch };
      // clamp
      if (typeof next.video_volume === 'number')
        next.video_volume = Math.max(0, Math.min(100, next.video_volume));
      if (typeof next.audio_volume === 'number')
        next.audio_volume = Math.max(0, Math.min(100, next.audio_volume));
      if (typeof next.audio_offset_sec === 'number')
        next.audio_offset_sec = Math.max(0, next.audio_offset_sec);
      return { audio: next };
    }),

  clearAudio: () =>
    withSnapshot(set as any, get as any, () => ({ audio: null })),

  // ----- History -----
  undo: () => {
    const { past, draft } = get();
    if (past.length === 0 || !draft) return;
    const prev = past[past.length - 1];
    set({
      draft: cloneDraft(prev),
      past: past.slice(0, -1),
      future: [cloneDraft(draft), ...get().future].slice(0, 50),
    });
  },

  redo: () => {
    const { future, draft } = get();
    if (future.length === 0 || !draft) return;
    const nxt = future[0];
    set({
      draft: cloneDraft(nxt),
      future: future.slice(1),
      past: [...get().past, cloneDraft(draft)].slice(-50),
    });
  },

  pushChatUser: (text) =>
    set((s) => ({
      chat: [
        ...s.chat,
        {
          id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          role: 'user',
          text,
          created_at: Date.now(),
        },
      ],
    })),

  pushChatAI: (text, actions) =>
    set((s) => ({
      chat: [
        ...s.chat,
        {
          id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          role: 'ai',
          text,
          actions,
          created_at: Date.now(),
        },
      ],
    })),

  setAiLoading: (b) => set({ aiLoading: b }),
}));
