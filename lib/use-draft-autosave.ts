/**
 * useDraftAutoSave — Hook d'auto-save d'un brouillon de card (Pascal #334).
 *
 * Debounce 1.5s sur la valeur observée. POST /api/drafts.
 * Si draftId fourni → update (upsert). Sinon → premier save crée l'id et
 * onSaved(newId) est appelé pour que le composant puisse retenir l'id.
 *
 * - Pas de save tant que la valeur n'a pas effectivement changé après mount.
 * - Pas de save si shouldSave === false (ex: pas de fichier sélectionné).
 *
 * Doctrine [[talk2me-card-editor-ia]] : reprise possible plus tard depuis /drafts.
 */
'use client';

import { useEffect, useRef } from 'react';

interface UseDraftAutoSaveArgs<T> {
  /** Snapshot sérialisable du draft. Une nouvelle référence === changement. */
  value: T;
  /** Type côté DB. */
  type: 'image' | 'video' | 'texte';
  /** Id existant si on reprend un brouillon. null si nouveau. */
  draftId: string | null;
  /** False → désactive l'auto-save (ex: avant choix du fichier). */
  shouldSave: boolean;
  /** Thumbnail URL pour l'affichage dans /drafts (preview). */
  thumbnailUrl?: string | null;
  /** Titre court pour l'affichage dans /drafts. */
  title?: string | null;
  /** Callback appelé avec l'id quand le serveur a sauvegardé. */
  onSaved?: (id: string) => void;
  /** Debounce en ms (default 1500). */
  delayMs?: number;
}

export function useDraftAutoSave<T>({
  value,
  type,
  draftId,
  shouldSave,
  thumbnailUrl = null,
  title = null,
  onSaved,
  delayMs = 1500,
}: UseDraftAutoSaveArgs<T>) {
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const idRef = useRef<string | null>(draftId);

  // Sync ref si le caller change explicitement le draftId.
  useEffect(() => {
    idRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    // Skip first render
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!shouldSave) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: idRef.current,
            type,
            draft_data: value,
            thumbnail_url: thumbnailUrl,
            title,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const newId = json?.draft?.id;
          if (typeof newId === 'string' && newId && newId !== idRef.current) {
            idRef.current = newId;
            onSaved?.(newId);
          }
        }
      } catch {
        // silent — auto-save n'est pas critique
      } finally {
        inflightRef.current = false;
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, shouldSave]);
}

/** Save final sans debounce (à appeler au close si pas encore publié). */
export async function saveDraftNow(args: {
  id: string | null;
  type: 'image' | 'video' | 'texte' | 'gabarit';
  draftData: unknown;
  thumbnailUrl?: string | null;
  title?: string | null;
}): Promise<string | null> {
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: args.id,
        type: args.type,
        draft_data: args.draftData,
        thumbnail_url: args.thumbnailUrl ?? null,
        title: args.title ?? null,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.draft?.id === 'string' ? json.draft.id : null;
  } catch {
    return null;
  }
}

/** Supprime le brouillon (après publish). */
export async function deleteDraftNow(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}
