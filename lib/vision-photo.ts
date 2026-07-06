/**
 * Talk2Me — SÉLECTION PAR VISION (#25, Pascal 2026-06-08).
 *
 * L'Agent Marchand ne garde que les produits aux BELLES photos et choisit la
 * plus belle (idéalement avec un mannequin/une personne) comme couverture.
 * DeepSeek ne VOIT pas les images → on utilise un modèle VISION dédié, compatible
 * API OpenAI (marche avec OpenAI gpt-4o-mini OU Google Gemini via endpoint compat).
 *
 * Clé via env (KILL-SWITCH [[lib/api-keys]]) :
 *   VISION_API_KEY   (obligatoire pour activer la vision)
 *   VISION_BASE_URL  (déf. https://api.openai.com/v1)
 *   VISION_MODEL     (déf. gpt-4o-mini)
 * Sans clé → renvoie null (l'appelant garde un fallback non-vision).
 */

import OpenAI from 'openai';

export type PhotoPose = 'front' | 'side' | 'back' | 'closeup' | 'flatlay' | 'other';

export interface PhotoVerdict {
  best_index: number; // index de la photo retenue
  quality: number; // 0..1 : photo nette/pro/attractive
  has_person: boolean; // un mannequin / une personne porte/utilise le produit
  pose: PhotoPose; // cadrage de la photo retenue → sert la COHÉRENCE du catalogue
}

export function visionConfigured(): boolean {
  return !!process.env.VISION_API_KEY;
}

/** Évalue un jeu de photos produit. Renvoie le meilleur index + un score. */
export async function assessPhotos(images: string[], productLabel: string): Promise<PhotoVerdict | null> {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey || images.length === 0) return null;
  const imgs = images.slice(0, 6); // on borne le coût

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.VISION_BASE_URL || 'https://api.openai.com/v1',
      timeout: 30000,
      maxRetries: 1,
    });
    const model = process.env.VISION_MODEL || 'gpt-4o-mini';
    // Gemini 2.5 « réfléchit » et consomme le budget tokens → on désactive le thinking.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geminiExtra: any = model.includes('gemini') ? { reasoning_effort: 'none' } : {};
    const completion = await client.chat.completions.create({
      model,
      ...geminiExtra,
      messages: [
        {
          role: 'system',
          content:
            `Tu es directeur artistique e-commerce. On te donne les photos d'un produit (${productLabel}). ` +
            `Objectif : un catalogue COHÉRENT où toutes les vignettes se ressemblent — on privilégie une photo ` +
            `avec un mannequin/une personne VU DE FACE, visage et produit bien cadrés (plan buste/portrait), ` +
            `nette et pro (pas de fond blanc nu, pas de collage, pas de filigrane). ` +
            `Choisis l'index de la MEILLEURE photo dans ce style. Classe sa pose : ` +
            `"front" (de face), "side" (profil), "back" (dos), "closeup" (gros plan détail), "flatlay" (posé à plat/fond blanc), "other". ` +
            `Réponds UNIQUEMENT en JSON : {"best_index": <0-based>, "quality": <0..1>, "has_person": <bool>, "pose": "<front|side|back|closeup|flatlay|other>"}.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Photos (index 0 à ${imgs.length - 1}) :` },
            ...imgs.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
      temperature: 0,
      max_tokens: 300,
    });
    const raw = completion.choices[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const v = JSON.parse(m[0]) as Partial<PhotoVerdict>;
    const idx = typeof v.best_index === 'number' && v.best_index >= 0 && v.best_index < imgs.length ? v.best_index : 0;
    const poses: PhotoPose[] = ['front', 'side', 'back', 'closeup', 'flatlay', 'other'];
    return {
      best_index: idx,
      quality: typeof v.quality === 'number' ? Math.max(0, Math.min(1, v.quality)) : 0.5,
      has_person: v.has_person === true,
      pose: poses.includes(v.pose as PhotoPose) ? (v.pose as PhotoPose) : 'other',
    };
  } catch {
    return null;
  }
}
