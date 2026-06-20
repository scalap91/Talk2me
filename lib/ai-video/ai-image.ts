'use server-only';

/**
 * Génération d'IMAGES INÉDITES par IA (Pascal 2026-06-11 : « je veux que l'IA
 * fasse notre vidéo, une vidéo inédite »). Hugging Face **Inference Providers**
 * (routeur), provider `together`, modèle **FLUX.1-schnell** (rapide, gratuit avec
 * un token HF). API style OpenAI images → data[0].b64_json. Gated sur token HF
 * (clé user BYOK 'huggingface' ou env HUGGINGFACE_API_KEY). Chaque image est
 * générée pour la vidéo → n'existe nulle part ailleurs.
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { gpuImage, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';

const DIR = process.cwd() + '/public/uploads/aivid-gen';
const ENDPOINT = 'https://router.huggingface.co/together/v1/images/generations';
const MODEL = 'black-forest-labs/FLUX.1-schnell';

export function aiImageAvailable(userKey?: string | null): boolean {
  // Notre GPU d'abord (illimité), sinon clé HF (user ou plateforme).
  return gpuWorkerAvailable() || !!(userKey || process.env.HUGGINGFACE_API_KEY);
}

/** Style ajouté au prompt pour un rendu vidéo léché. */
function buildPrompt(q: string): string {
  return `${q}, cinematic, high detail, dramatic lighting, photorealistic, professional photography`;
}

/** Génère une image IA inédite. Retourne le chemin local ou null. */
export async function generateAiImage(query: string, portrait: boolean, userKey?: string): Promise<string | null> {
  const q = (query || '').trim();
  if (!q) return null;
  // 1) NOTRE GPU en priorité (FLUX local, illimité, sans clé)
  if (gpuWorkerAvailable()) {
    const local = await gpuImage(buildPrompt(q), portrait);
    if (local) return local;
  }
  // 2) sinon Hugging Face (clé user ou plateforme)
  const token = userKey || process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;
  // dimensions multiples de 16
  const [w, h] = portrait ? [720, 1280] : [1280, 720];
  try {
    // HF free rate-limite (429) les requêtes concurrentes → retry avec back-off
    // jitter pour étaler les appels parallèles et réussir plus d'images.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt: buildPrompt(q), width: w, height: h, response_format: 'b64_json' }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 + attempt * 2000 + Math.floor(Math.abs(Math.sin(attempt + w)) * 1000)));
    }
    if (!res || !res.ok) return null;
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = data.data?.[0];
    let buf: Buffer | null = null;
    if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64');
    else if (item?.url) {
      const r2 = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
      if (r2.ok) buf = Buffer.from(await r2.arrayBuffer());
    }
    if (!buf || buf.length < 2048) return null;
    if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });
    const out = path.join(DIR, `${randomUUID()}.jpg`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}
