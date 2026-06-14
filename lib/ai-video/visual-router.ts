'use server-only';

/**
 * Talk2Me — B. ROUTEUR VISUEL (Pascal 2026-06-12).
 * Selon le PLAN (visual_strategy), choisit AUTOMATIQUEMENT la source visuelle de
 * chaque plan : image attachée → img2img (reproduction) → vraie photo → carte texte.
 * Avatar / vidéo = moteurs à venir → repli propre sur réel (jamais de blocage).
 *
 * Doctrine : techno interne, sources externes en RÉFÉRENCE. Jamais d'invention libre.
 */

import { fetchBackgroundImage } from '@/lib/ai-video/images';
import { gpuImg2img, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import type { VideoPlan, VisualStrategy } from '@/lib/ai-video/plan';
import type { VideoSegment } from '@/lib/ai-video/script';

export type VisualKind =
  | 'attached' | 'real_photo' | 'img2img' | 'text_card' | 'avatar_pending' | 'video_pending';

export interface VisualResult {
  imagePath: string | null; // chemin local absolu, ou null = carte texte (render.ts)
  kind: VisualKind;
}

export interface VisualContext {
  attachedImgs: string[]; // images attachées par l'user (chemins locaux résolus)
  index: number;          // index du plan
  portrait: boolean;
  topic: string;          // sujet pour fallback de requête
}

export async function resolveSegmentVisual(
  segment: VideoSegment,
  plan: VideoPlan,
  ctx: VisualContext,
): Promise<VisualResult> {
  // 1) image attachée par l'user → priorité absolue (réelle, voulue)
  if (ctx.attachedImgs.length) {
    return { imagePath: ctx.attachedImgs[ctx.index % ctx.attachedImgs.length], kind: 'attached' };
  }

  const query = segment.visual || segment.caption || plan.title || ctx.topic;
  // avatar non câblé → repli réel (l'avatar sera un moteur dédié plus tard)
  const strat: VisualStrategy = plan.visual_strategy === 'avatar' ? 'real_photos' : plan.visual_strategy;

  // 2) carte texte (sujet abstrait)
  if (strat === 'text_cards') {
    return { imagePath: null, kind: 'text_card' };
  }

  // 3) img2img : référence réelle → NOTRE moteur la reproduit (libre de droit)
  if (strat === 'img2img' && gpuWorkerAvailable()) {
    const ref = (await fetchBackgroundImage(query)) || (await fetchBackgroundImage(plan.title || ctx.topic));
    if (!ref) return { imagePath: null, kind: 'text_card' };
    const repro = await gpuImg2img({ path: ref }, query, ctx.portrait);
    if (repro) return { imagePath: repro, kind: 'img2img' };
    return { imagePath: ref, kind: 'real_photo' }; // repro KO → la vraie photo (réelle)
  }

  // 4) real_photos (défaut) + mixed : vraie photo de référence documentée
  const img = (await fetchBackgroundImage(query)) || (await fetchBackgroundImage(plan.title || ctx.topic));
  return img ? { imagePath: img, kind: 'real_photo' } : { imagePath: null, kind: 'text_card' };
}
