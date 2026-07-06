/**
 * lib/compute/worker-score.ts — Classe un appareil comme OUVRIER de calcul (Pascal 2026-07-04).
 * Server-safe (pas de 'use client'). À partir des capacités rapportées → tier bon/moyen/faible.
 * On ne confie du travail qu'aux BONS candidats (WebGPU + assez de cœurs/RAM, idéal si natif+charge).
 */
export interface WorkerCaps {
  webgpu?: boolean;
  gpu?: string | null;
  cores?: number;
  memory_gb?: number | null;
  native?: boolean;
  platform?: string;
  charging?: boolean | null;
}
export type WorkerTier = 'good' | 'medium' | 'weak';

// GPU costaud reconnu (mobile & desktop) — accessible via WebGL/MediaPipe même SANS WebGPU.
const STRONG_GPU = /adreno (6|7|8)\d\d|xclipse|apple a1[3-9]|apple m\d|mali-g[57]|immortalis|rtx|radeon|geforce|nvidia|intel arc/i;

export function scoreWorker(c: WorkerCaps): { tier: WorkerTier; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Accès au GPU : WebGPU = idéal, mais un GPU costaud via WebGL/MediaPipe suffit largement
  // (c'est le chemin des filtres caméra de l'app — prouvé sur ces téléphones).
  const strongGpu = !!(c.gpu && STRONG_GPU.test(c.gpu));
  if (c.webgpu) { score += 50; reasons.push('WebGPU (accès GPU direct)'); }
  else if (strongGpu) { score += 38; reasons.push('GPU costaud via WebGL/MediaPipe'); }
  else if (c.gpu) { score += 15; reasons.push('GPU basique (WebGL)'); }
  else { reasons.push('Pas d’accès GPU'); }

  const cores = c.cores || 0;
  if (cores >= 8) { score += 20; reasons.push(`${cores} cœurs`); }
  else if (cores >= 6) { score += 12; reasons.push(`${cores} cœurs`); }
  else if (cores >= 4) { score += 5; reasons.push(`${cores} cœurs`); }

  const mem = c.memory_gb || 0;
  if (mem >= 8) { score += 20; reasons.push(`${mem} Go RAM`); }
  else if (mem >= 4) { score += 12; reasons.push(`${mem} Go RAM`); }
  else if (mem > 0) reasons.push(`${mem} Go RAM`);

  if (c.native) { score += 10; reasons.push('App native (calcul de nuit possible)'); }

  const tier: WorkerTier = score >= 60 ? 'good' : score >= 30 ? 'medium' : 'weak';
  return { tier, score, reasons };
}
