'use server-only';

/**
 * Talk2Me — Moteur image-fixe → VIDÉO (HunyuanVideo I2V) sur NOTRE GPU (ComfyUI).
 *
 * Cœur de la synergie Studio créatif (Pascal 2026-06-18) : le composer studio produit
 * une IMAGE FIXE par scène (script → SDXL) ; ce moteur prend cette image fixe et lui
 * DONNE VIE (vidéo photoréaliste). Réutilisé aussi par l'avatar "portrait + paysage".
 *
 * Recette validée : cfg=1.0 (modèle guidance-distilled — cfg élevé = quadrillage),
 * 30 steps, euler/simple, ModelSamplingSD3 shift 7, guidance "v1 (concat)", VAEDecode simple,
 * sortie SaveWEBM (vp9) → transcodée MP4 (lit partout).
 *
 * ComfyUI est joint via le tunnel local (COMFY_URL, défaut 127.0.0.1:8188). Si indisponible
 * → retourne null (l'appelant garde l'image fixe en fallback : aucune régression).
 */

import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hunyuanI2vAvailable(): boolean {
  return !!(process.env.COMFY_URL || process.env.HUNYUAN_I2V === '1');
}

function graph(imageName: string, prompt: string, seed: number, width: number, height: number, length: number) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'hunyuan_video_I2V-Q4_K_S.gguf' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'clip_l.safetensors', clip_name2: 'llava_llama3_fp8_scaled.safetensors', type: 'hunyuan_video' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'hunyuan_video_vae_bf16.safetensors' } },
    '4': { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'llava_llama3_vision.safetensors' } },
    '5': { class_type: 'LoadImage', inputs: { image: imageName } },
    '6': { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['4', 0], image: ['5', 0], crop: 'center' } },
    '7': { class_type: 'TextEncodeHunyuanVideo_ImageToVideo', inputs: { clip: ['2', 0], clip_vision_output: ['6', 0], prompt, image_interleave: 2 } },
    '8': { class_type: 'HunyuanImageToVideo', inputs: { positive: ['7', 0], vae: ['3', 0], width, height, length, batch_size: 1, guidance_type: 'v1 (concat)', start_image: ['5', 0] } },
    '9': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['8', 0] } },
    '11': { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 7.0 } },
    '10': { class_type: 'KSampler', inputs: { model: ['11', 0], seed, steps: 20, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', positive: ['8', 0], negative: ['9', 0], latent_image: ['8', 1], denoise: 1.0 } },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['10', 0], vae: ['3', 0] } },
    '13': { class_type: 'SaveWEBM', inputs: { images: ['12', 0], filename_prefix: 't2m_i2v', codec: 'vp9', fps: 16.0, crf: 28.0 } },
  };
}

function ffmpegToMp4(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', input,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', output,
    ]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c + ': ' + err.slice(-200)))));
  });
}

export interface I2vResult { ok: boolean; mp4Path?: string; error?: string }

/**
 * Anime une image fixe en vidéo MP4. `imageBuf` = l'image fixe (JPEG/PNG). Écrit le MP4
 * dans `outDir/outName.mp4`. Portrait par défaut (608×800, 49 images ≈ 3 s). Retourne le
 * chemin disque du MP4 ou une erreur. ~3-5 min GPU.
 */
export async function hunyuanImageToVideo(opts: {
  imageBuf: Buffer;
  prompt: string;
  outDir: string;
  outName: string;
  width?: number;
  height?: number;
  length?: number;
  seed?: number;
}): Promise<I2vResult> {
  const { imageBuf, prompt, outDir, outName } = opts;
  const width = opts.width ?? 608, height = opts.height ?? 800, length = opts.length ?? 49;
  const seed = opts.seed ?? Math.floor((Date.now() % 1_000_000_000));
  const base = COMFY.replace(/\/$/, '');

  // 1) upload de l'image fixe vers ComfyUI
  let name = '';
  try {
    const fd = new FormData();
    fd.append('image', new Blob([new Uint8Array(imageBuf)], { type: 'image/png' }), `t2m_fixed_${seed}.png`);
    fd.append('overwrite', 'true');
    const up = await fetch(`${base}/upload/image`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) });
    if (!up.ok) return { ok: false, error: 'gpu_unavailable' };
    const uj = await up.json();
    name = String(uj?.name || '');
    if (uj?.subfolder) name = `${uj.subfolder}/${name}`;
    if (!name) return { ok: false, error: 'upload_failed' };
  } catch { return { ok: false, error: 'gpu_unavailable' }; }

  // 2) soumission
  let promptId = '';
  try {
    const sub = await fetch(`${base}/prompt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph(name, prompt, seed, width, height, length) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!sub.ok) return { ok: false, error: 'submit_failed' };
    promptId = String((await sub.json())?.prompt_id || '');
    if (!promptId) return { ok: false, error: 'submit_failed' };
  } catch { return { ok: false, error: 'submit_failed' }; }

  // 3) poll (max 12 min)
  let outFile: { filename: string; subfolder: string; type: string } | null = null;
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(6000);
    try {
      const h = await fetch(`${base}/history/${promptId}`, { signal: AbortSignal.timeout(20000) });
      if (!h.ok) continue;
      const entry = (await h.json())?.[promptId];
      if (!entry) continue;
      if (entry?.status?.status_str === 'error') return { ok: false, error: 'generation_error' };
      for (const node of Object.values<any>(entry?.outputs || {})) {
        const arr = [...(node?.images || []), ...(node?.gifs || []), ...(node?.videos || [])];
        const f = arr.find((x: any) => String(x?.filename || '').toLowerCase().endsWith('.webm'));
        if (f) { outFile = { filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' }; break; }
      }
      if (outFile || entry?.status?.completed) break;
    } catch { /* retry */ }
  }
  if (!outFile) return { ok: false, error: 'timeout' };

  // 4) fetch WebM + transcodage MP4
  const tmp = path.join(os.tmpdir(), `t2m_i2v_${seed}.webm`);
  try {
    const qs = new URLSearchParams({ filename: outFile.filename, subfolder: outFile.subfolder, type: outFile.type });
    const v = await fetch(`${base}/view?${qs.toString()}`, { signal: AbortSignal.timeout(60000) });
    if (!v.ok) return { ok: false, error: 'fetch_failed' };
    await writeFile(tmp, Buffer.from(await v.arrayBuffer()));
    await mkdir(outDir, { recursive: true });
    const mp4Path = path.join(outDir, `${outName}.mp4`);
    await ffmpegToMp4(tmp, mp4Path);
    await readFile(mp4Path); // garantit l'écriture
    return { ok: true, mp4Path };
  } catch (e) {
    return { ok: false, error: 'finalize_failed:' + String((e as Error)?.message || '').slice(0, 80) };
  } finally {
    unlink(tmp).catch(() => {});
  }
}
