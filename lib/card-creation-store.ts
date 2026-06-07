/**
 * card-creation-store — Zustand store global pour piloter l'ouverture
 * du CardCreationSheet (bottom-sheet "Créer une card") depuis n'importe
 * où dans l'app (typiquement le bouton + central du BottomNav).
 *
 * Talk2Me #334 (Pascal 2026-06-04). Doctrine [[talk2me-card-editor-ia]].
 */
'use client';

import { create } from 'zustand';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

interface CardCreationState {
  open: boolean;
  /** Talk2Me #422 — son présélectionné depuis Music Card (bouton +). Injecté
   *  dans VideoCardEditor comme musique déjà attachée. */
  presetMusic: UnifiedCard | null;
  /** Talk2Me #425 — produit présélectionné (depuis une ProductCard de Léa).
   *  Ouvre directement l'éditeur Texte avec le produit attaché → la card ira
   *  dans le Hub (description + aperçu) ET dans le Shop. */
  presetProduct: ProductCardData | null;
  openSheet: (presetMusic?: UnifiedCard | null) => void;
  /** Ouvre la création avec un produit pré-attaché (chemin "via Léa"). */
  openWithProduct: (product: ProductCardData) => void;
  closeSheet: () => void;
}

// Garde : openSheet est parfois passé directement comme handler onClick → le
// 1er argument serait alors un SyntheticEvent, pas une UnifiedCard. On ne
// retient le preset que si ce n'est PAS un event React.
function asPreset(x: unknown): UnifiedCard | null {
  if (x && typeof x === 'object' && !('nativeEvent' in (x as object))) {
    return x as UnifiedCard;
  }
  return null;
}

export const useCardCreationStore = create<CardCreationState>((set) => ({
  open: false,
  presetMusic: null,
  presetProduct: null,
  openSheet: (presetMusic) =>
    set({ open: true, presetMusic: asPreset(presetMusic), presetProduct: null }),
  openWithProduct: (product) =>
    set({ open: true, presetProduct: product ?? null, presetMusic: null }),
  closeSheet: () => set({ open: false, presetMusic: null, presetProduct: null }),
}));
