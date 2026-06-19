'use server-only';

/**
 * Talk2Me — Composer : GRAPHE DE DÉPENDANCES (Pascal 2026-06-12).
 * Quand un INPUT d'un projet change, on n'invalide QUE les blocs qui en dépendent.
 * → on ne régénère que le nécessaire (cache de rendu partiel).
 *
 * Exemples (verbatim Pascal) :
 *  - modifier le script  → régénérer voix + lip-sync(avatar) + sous-titres ; PAS image/musique.
 *  - modifier l'avatar   → régénérer vidéo avatar ; garder script/voix.
 *  - modifier une image  → régénérer UNIQUEMENT la scène concernée (son bloc image).
 */

// 'motion' = clip vivant d'une scène (image animée via I2V). OPT-IN par scène
// (« Donner vie ») : jamais régénéré au rendu complet, seulement sur demande explicite.
export type BlockKind = 'voice' | 'image' | 'avatar' | 'subtitle' | 'music' | 'motion';
export type BlockStatus = 'draft' | 'rendered' | 'modified' | 'error';

/** Inputs éditables au niveau d'UNE scène. */
export type SceneInput = 'script' | 'visual_prompt' | 'image_override';
/** Inputs éditables au niveau du PROJET (globaux). */
export type GlobalInput = 'avatar_settings' | 'music';

/** Script (narration/caption) → voix, lip-sync avatar, sous-titres de CETTE scène. */
export const SCENE_DEPENDENTS: Record<SceneInput, BlockKind[]> = {
  script: ['voice', 'avatar', 'subtitle'],
  visual_prompt: ['image'],
  image_override: ['image'],
};

/** Inputs globaux → blocs à invalider (scope 'scene' = sur toutes les scènes). */
export const GLOBAL_DEPENDENTS: Record<GlobalInput, { scope: 'scene' | 'global'; blocks: BlockKind[] }> = {
  avatar_settings: { scope: 'scene', blocks: ['avatar'] },
  music: { scope: 'global', blocks: ['music'] },
};

/** Blocs invalidés par un changement d'input de scène. */
export function dependentsOfSceneInput(input: SceneInput): BlockKind[] {
  return SCENE_DEPENDENTS[input] || [];
}

/** Blocs invalidés par un changement d'input global. */
export function dependentsOfGlobalInput(input: GlobalInput): { scope: 'scene' | 'global'; blocks: BlockKind[] } {
  return GLOBAL_DEPENDENTS[input] || { scope: 'scene', blocks: [] };
}

/** Un bloc doit-il être (re)généré au rendu ? (tout sauf 'rendered' avec un asset). */
export function needsRender(status: BlockStatus, hasAsset: boolean): boolean {
  if (status === 'rendered' && hasAsset) return false; // caché → on réutilise
  return status !== 'rendered' || !hasAsset;
}
