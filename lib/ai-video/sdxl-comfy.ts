'use server-only';

/**
 * Talk2Me — Génération d'IMAGE de scène via SDXL sur NOTRE GPU (ComfyUI), joint par le tunnel
 * (COMFY_URL, défaut 127.0.0.1:8188). Remplace les images stock aléatoires (croquis incohérents)
 * par des images générées, photoréalistes et de STYLE COHÉRENT (suffixe + seed dérivé). Pascal 2026-06-19.
 *
 * Repli gracieux : si ComfyUI/SDXL indisponible → null → l'appelant retombe sur le stock (zéro casse).
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const IMG_DIR = process.cwd() + '/public/uploads/aivid-img';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Style commun à toutes les scènes d'un même rendu → cohérence visuelle (la « vraie histoire »).
const STYLE = 'photorealistic, cinematic lighting, high detail, professional photography, consistent style, no text, no watermark';
const NEG = 'sketch, drawing, cartoon, illustration, lowres, blurry, watermark, text, logo, deformed';

export function sdxlAvailable(): boolean {
  return !!(process.env.COMFY_URL || process.env.SDXL_COMFY === '1');
}

function graph(prompt: string, seed: number, width: number, height: number) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: `${prompt}, ${STYLE}` } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: NEG } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed, steps: 25, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'sdxl_scene' } },
  };
}

/**
 * Génère une image de scène SDXL. `portrait` → 832×1216 (9:16-ish SDXL), sinon paysage.
 * `seed` déterministe (cohérence). Retourne le chemin LOCAL du .png ou null.
 */
export async function sdxlSceneImage(prompt: string, portrait: boolean, seed?: number): Promise<string | null> {
  const base = COMFY.replace(/\/$/, '');
  if (!prompt.trim()) return null;
  const width = portrait ? 832 : 1216;
  const height = portrait ? 1216 : 832;
  const sd = seed ?? Math.floor((Date.now() % 1_000_000_000));

  let promptId = '';
  try {
    const sub = await fetch(`${base}/prompt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph(prompt.slice(0, 400), sd, width, height) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!sub.ok) return null;
    promptId = String((await sub.json())?.prompt_id || '');
    if (!promptId) return null;
  } catch { return null; }

  // SDXL ~10-30 s. Poll jusqu'à 90 s.
  let outFile: { filename: string; subfolder: string; type: string } | null = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      const h = await fetch(`${base}/history/${promptId}`, { signal: AbortSignal.timeout(15000) });
      if (!h.ok) continue;
      const entry = (await h.json())?.[promptId];
      if (!entry) continue;
      if (entry?.status?.status_str === 'error') return null;
      for (const node of Object.values<any>(entry?.outputs || {})) {
        const f = (node?.images || []).find((x: any) => String(x?.filename || '').toLowerCase().endsWith('.png'));
        if (f) { outFile = { filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' }; break; }
      }
      if (outFile) break;
    } catch { /* retry */ }
  }
  if (!outFile) return null;

  try {
    const qs = new URLSearchParams({ filename: outFile.filename, subfolder: outFile.subfolder, type: outFile.type });
    const v = await fetch(`${base}/view?${qs.toString()}`, { signal: AbortSignal.timeout(30000) });
    if (!v.ok) return null;
    if (!existsSync(IMG_DIR)) await mkdir(IMG_DIR, { recursive: true });
    const out = path.join(IMG_DIR, `sdxl-${randomUUID()}.png`);
    await writeFile(out, Buffer.from(await v.arrayBuffer()));
    return out;
  } catch { return null; }
}
