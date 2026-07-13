/**
 * lib/compute/task-queue.ts — File de tâches du COMPUTE MESH (Pascal 2026-07-04).
 *
 * DOCTRINE : le calcul (OCR/vision des figures) se fait sur les GPU des TÉLÉPHONES CONNECTÉS.
 * Le serveur ne calcule pas : il met les figures en TÂCHES, les téléphones du pool les PRENNENT
 * (`claim`), traitent sur leur GPU, et renvoient le résultat (`result`). Redondance + reprise
 * si un worker lâche. Store mémoire du process (tâches courtes). [[project_talk2me_compute_mesh]]
 */
export interface ComputeTask {
  id: string;
  batch: string;          // regroupe les tâches d'une même formation
  type: 'ocr' | 'label';  // 'ocr' = texte (Tesseract/ML Kit) ; 'label' = objets/couleurs (ML Kit Image Labeling)
  imageUrl: string;
  status: 'pending' | 'assigned' | 'done';
  result: string;
  via?: 'native' | 'web';   // preuve : GPU natif (ML Kit) ou CPU web (Tesseract)
  workerId?: string;
  attempts: number;
  createdAt: number;
  assignedAt?: number;
  doneAt?: number;
}

const TASKS = new Map<string, ComputeTask>();

// OCR ON-DEVICE hors file (ex. scan karaoké : le tél OCR son propre écran, sans passer par claim).
// On les compte quand même → visibles dans le tableau de bord du mesh (« GPU natif »). Pascal 2026-07-13.
let odNative = 0, odWeb = 0;
export function recordOnDeviceOcr(via?: 'native' | 'web'): void {
  if (via === 'native') odNative++; else if (via === 'web') odWeb++;
}
const STALE_MS = 20_000;   // un worker qui ne rend pas en 20 s → la tâche repart au pool
const TTL_MS = 20 * 60_000;
const MAX_ATTEMPTS = 4;

function uid(): string {
  return globalThis.crypto?.randomUUID?.() || `t_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
}

function sweep() {
  const now = Date.now();
  for (const [id, t] of TASKS) if (now - t.createdAt > TTL_MS) TASKS.delete(id);
}

/** Crée une tâche OCR pour une figure (rattachée à un batch = une formation). */
export function createOcrTask(batch: string, imageUrl: string): ComputeTask {
  sweep();
  const t: ComputeTask = { id: uid(), batch, type: 'ocr', imageUrl, status: 'pending', result: '', attempts: 0, createdAt: Date.now() };
  TASKS.set(t.id, t);
  return t;
}

/** Crée une tâche LABEL (vision objets/couleurs — ML Kit Image Labeling) sur une image. Pascal 2026-07-12. */
export function createLabelTask(imageUrl: string): ComputeTask {
  sweep();
  const t: ComputeTask = { id: uid(), batch: `label_${uid()}`, type: 'label', imageUrl, status: 'pending', result: '', attempts: 0, createdAt: Date.now() };
  TASKS.set(t.id, t);
  return t;
}

/** Lit l'état/résultat d'UNE tâche (pour poller une tâche unique, ex. vision d'annonce). */
export function getTask(taskId: string): { status: ComputeTask['status']; result: string; via?: 'native' | 'web' } | null {
  const t = TASKS.get(taskId);
  return t ? { status: t.status, result: t.result, via: t.via } : null;
}

/** Un téléphone du pool PREND une tâche à traiter (ou null si rien). Reprend d'abord les tâches lâchées. */
export function claimTask(workerId: string): { id: string; type: 'ocr' | 'label'; imageUrl: string } | null {
  const now = Date.now();
  // Reprise : tâches assignées mais non rendues à temps → repassent en attente.
  for (const t of TASKS.values()) {
    if (t.status === 'assigned' && now - (t.assignedAt || 0) > STALE_MS && t.attempts < MAX_ATTEMPTS) t.status = 'pending';
  }
  // On évite de redonner au même worker une tâche qu'il vient de lâcher.
  for (const t of TASKS.values()) {
    if (t.status === 'pending' && t.workerId !== workerId) {
      t.status = 'assigned'; t.workerId = workerId; t.assignedAt = now; t.attempts++;
      return { id: t.id, type: t.type, imageUrl: t.imageUrl };
    }
  }
  // Sinon (pool minuscule) on autorise le même worker.
  for (const t of TASKS.values()) {
    if (t.status === 'pending') {
      t.status = 'assigned'; t.workerId = workerId; t.assignedAt = now; t.attempts++;
      return { id: t.id, type: t.type, imageUrl: t.imageUrl };
    }
  }
  return null;
}

/** Un worker RENVOIE le résultat d'une tâche (+ comment il l'a traité : GPU natif ou CPU web). */
export function submitResult(taskId: string, workerId: string, text: string, via?: 'native' | 'web'): boolean {
  const t = TASKS.get(taskId);
  if (!t || t.status === 'done') return false;
  t.status = 'done'; t.result = text || ''; t.workerId = workerId; t.doneAt = Date.now();
  if (via === 'native' || via === 'web') t.via = via;
  return true;
}

/** État d'un batch (pour que le producteur attende / récupère les résultats). */
export function batchStatus(batch: string): { total: number; done: number; results: { imageUrl: string; text: string }[] } {
  const all = [...TASKS.values()].filter((t) => t.batch === batch);
  const done = all.filter((t) => t.status === 'done');
  return { total: all.length, done: done.length, results: done.map((t) => ({ imageUrl: t.imageUrl, text: t.result })) };
}

/** Combien de tâches en attente dans tout le pool (pour le worker : y a-t-il du boulot ?). */
export function pendingCount(): number {
  return [...TASKS.values()].filter((t) => t.status !== 'done').length;
}

/** Stats live pour le panneau dev (progression des GPU). */
export function queueStats() {
  const all = [...TASKS.values()];
  let pending = 0, assigned = 0, done = 0, gpuNative = 0, cpuWeb = 0;
  const batches = new Map<string, { total: number; done: number; assigned: number; lastWorker?: string }>();
  const workers = new Set<string>();
  for (const t of all) {
    if (t.status === 'pending') pending++; else if (t.status === 'assigned') assigned++; else done++;
    if (t.status === 'done' && t.via === 'native') gpuNative++;
    if (t.status === 'done' && t.via === 'web') cpuWeb++;
    if (t.workerId) workers.add(t.workerId);
    const b = batches.get(t.batch) || { total: 0, done: 0, assigned: 0 };
    b.total++; if (t.status === 'done') b.done++; if (t.status === 'assigned') { b.assigned++; b.lastWorker = t.workerId; }
    batches.set(t.batch, b);
  }
  return {
    total: all.length + odNative + odWeb, pending, assigned, done: done + odNative + odWeb,
    // PREUVE : GPU natif (ML Kit) vs CPU web — inclut l'OCR hors-file (scan karaoké). Pascal 2026-07-13.
    gpuNative: gpuNative + odNative, cpuWeb: cpuWeb + odWeb,
    activeWorkers: workers.size,
    batches: [...batches.entries()].map(([id, b]) => ({ id, ...b })).filter((b) => b.done < b.total).slice(0, 8),
  };
}
