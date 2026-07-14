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
  /** Talk2Me #427 — produit actuellement affiché dans le Shop (carte scrollée).
   *  Le bouton + de la barre le sert dans le composer quand on est dans le Shop. */
  activeShopProduct: ProductCardData | null;
  /** Boutique actuellement affichée dans le Shop (carte scrollée).
   *  Le bouton + de la barre le sert dans le composer quand on est dans le Shop. */
  presetBoutiqueId: string | null;
  activeBoutiqueId: string | null;
  setActiveShopProduct: (product: ProductCardData | null) => void;
  setActiveBoutique: (id: string | null) => void;
  openSheet: (presetMusic?: UnifiedCard | null) => void;
  /** TRANSFERT DE COMPÉTENCES (Pascal 2026-07-14) : prépare un son SANS ouvrir la couche
   *  dormante — c'est /creer/texte qui le consommera au montage. */
  stageMusic: (card: UnifiedCard | null) => void;
  /** Ouvre la création avec un produit pré-attaché (chemin "via Léa"). */
  openWithProduct: (product: ProductCardData) => void;
  /** Bouton + : si un produit Shop est affiché → compose avec ; sinon création normale. */
  openCreate: () => void;
  closeSheet: () => void;
  /** Talk2Me — mode Shop : le bouton + affiche un menu contextuel (boutique / post). */
  shopMode: boolean;
  setShopMode: (b: boolean) => void;
  /** Talk2Me — ouverture du sheet de création de boutique. */
  boutiqueOpen: boolean;
  openBoutique: () => void;
  closeBoutique: () => void;
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

export const useCardCreationStore = create<CardCreationState>((set, get) => ({
  open: false,
  presetMusic: null,
  presetProduct: null,
  activeShopProduct: null,
  presetBoutiqueId: null,
  activeBoutiqueId: null,
  setActiveShopProduct: (product) => set({ activeShopProduct: product ?? null }),
  setActiveBoutique: (id) => set({ activeBoutiqueId: id ?? null }),
  openSheet: (presetMusic) =>
    set({ open: true, presetMusic: asPreset(presetMusic), presetProduct: null, presetBoutiqueId: null }),
  // TRANSFERT DE COMPÉTENCES : on stage le son SANS `open:true` → la couche dormante ne s'ouvre
  // pas ; /creer/texte lit `presetMusic` au montage et l'attache. Pascal 2026-07-14.
  stageMusic: (card) =>
    set({ presetMusic: asPreset(card), presetProduct: null, presetBoutiqueId: null }),
  openWithProduct: (product) =>
    set({ open: true, presetProduct: product ?? null, presetMusic: null, presetBoutiqueId: null }),
  // Bouton + : dans le Shop, on sert le produit ou la boutique affiché(e) ; sinon création normale.
  openCreate: () => {
    const b = get().activeBoutiqueId;
    const p = get().activeShopProduct;
    if (b) set({ open: true, presetBoutiqueId: b, presetProduct: null, presetMusic: null });
    else if (p) set({ open: true, presetProduct: p, presetMusic: null, presetBoutiqueId: null });
    else set({ open: true, presetMusic: null, presetProduct: null, presetBoutiqueId: null });
  },
  closeSheet: () => set({ open: false, presetMusic: null, presetProduct: null, presetBoutiqueId: null }),
  shopMode: false,
  setShopMode: (b) => set({ shopMode: b }),
  boutiqueOpen: false,
  openBoutique: () => set({ boutiqueOpen: true }),
  closeBoutique: () => set({ boutiqueOpen: false }),
}));
