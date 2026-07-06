/**
 * lib/formation-jobs.ts — Jobs de génération de formation en ARRIÈRE-PLAN (Pascal 2026-07-04).
 *
 * La génération (lecture PDF entier → condensation → plan → rédaction des modules) prend
 * plusieurs minutes : impossible en synchrone (le mobile coupe = erreur réseau). On lance
 * donc un JOB serveur qui tourne tout seul, le client POLL sa progression (barre + étape),
 * et l'utilisateur peut QUITTER l'écran pendant que ça travaille.
 *
 * Store en mémoire du process (jobs courts, quelques minutes). Un déploiement blue-green
 * peut perdre un job en cours — acceptable ; le client le détectera (job introuvable) et
 * proposera de relancer.
 */
import type { FormationPlan } from '@/lib/formation';

export interface FormationJob {
  id: string;
  userId: string;
  status: 'running' | 'done' | 'error';
  step: string;      // libellé humain de l'étape en cours
  progress: number;  // 0 → 100
  plan?: FormationPlan;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const JOBS = new Map<string, FormationJob>();
const TTL = 30 * 60 * 1000; // 30 min

function sweep() {
  const now = Date.now();
  for (const [id, j] of JOBS) if (now - j.updatedAt > TTL) JOBS.delete(id);
}

export function createJob(userId: string): FormationJob {
  sweep();
  const id = (globalThis.crypto?.randomUUID?.() || `job_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
  const now = Date.now();
  const job: FormationJob = { id, userId, status: 'running', step: 'Démarrage…', progress: 1, createdAt: now, updatedAt: now };
  JOBS.set(id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<FormationJob>): void {
  const j = JOBS.get(id);
  if (!j) return;
  Object.assign(j, patch, { updatedAt: Date.now() });
}

export function getJob(id: string): FormationJob | undefined {
  return JOBS.get(id);
}
