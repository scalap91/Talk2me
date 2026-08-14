'use server-only';

/**
 * Talk2Me — Moteur HunyuanCustom (sujet-driven) sur NOTRE GPU (ComfyUI).
 *
 * Module unifié Studio créatif (Pascal 2026-06-18) : prend une IMAGE de référence (sujet,
 * idéalement détouré) + un PROMPT → génère une VIDÉO mettant en scène ce sujet selon le prompt.
 * Plus puissant que l'I2V (qui anime une seule image) : ici le sujet est recomposé dans la scène.
 *
 * Recette validée (cf. memory project-talk2me-avatar-engine-gpu) :
 *  - modèle hunyuan_video_custom_720p_fp8_e4m3fn (PAS le fp8_scaled → bruit), quant fp8_e4m3fn
 *  - HyVideoBlockSwap OBLIGATOIRE (sinon OOM 24 Go)
 *  - VAE Kijai (hunyuan_video_vae_kijai.safetensors), le VAE Comfy-Org est rejeté
 *  - encodeur texte NATIF (DualCLIP fp8 + CLIPVision + TextEncodeHunyuanVideo_ImageToVideo)
 *    ponté via HyVideoTextEmbedBridge → pas besoin du llava 16 Go
 *  - sortie SaveWEBM → transcodée MP4 (lit partout)
 */

import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hunyuanCustomAvailable(): boolean {
  return !!(process.env.COMFY_URL || process.env.HUNYUAN_CUSTOM === '1');
}

function graph(imageName: string, prompt: string, seed: number, size: number, frames: number) {
  return {
    '14': { class_type: 'HyVideoBlockSwap', inputs: { double_blocks_to_swap: 20, single_blocks_to_swap: 20, offload_txt_in: true, offload_img_in: true } },
    '1': { class_type: 'HyVideoModelLoader', inputs: { model: 'hunyuan_video_custom_720p_fp8_e4m3fn.safetensors', base_precision: 'bf16', quantization: 'fp8_e4m3fn', load_device: 'offload_device', attention_mode: 'sdpa', block_swap_args: ['14', 0] } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'clip_l.safetensors', clip_name2: 'llava_llama3_fp8_scaled.safetensors', type: 'hunyuan_video' } },
    '3': { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'llava_llama3_vision.safetensors' } },
    '4': { class_type: 'LoadImage', inputs: { image: imageName } },
    '5': { class_type: 'ImageScale', inputs: { image: ['4', 0], upscale_method: 'bicubic', width: size, height: size, crop: 'center' } },
    '6': { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['3', 0], image: ['5', 0], crop: 'center' } },
    '7': { class_type: 'TextEncodeHunyuanVideo_ImageToVideo', inputs: { clip: ['2', 0], clip_vision_output: ['6', 0], prompt, image_interleave: 2 } },
    '8': { class_type: 'HyVideoTextEmbedBridge', inputs: { positive: ['7', 0], cfg: 1.0, start_percent: 0.0, end_percent: 1.0, batched_cfg: false, use_cfg_zero_star: false } },
    '9': { class_type: 'HyVideoVAELoader', inputs: { model_name: 'hunyuan_video_vae_kijai.safetensors', precision: 'bf16' } },
    '10': { class_type: 'HyVideoEncode', inputs: { vae: ['9', 0], image: ['5', 0], enable_vae_tiling: false, temporal_tiling_sample_size: 64, spatial_tile_sample_min_size: 256, auto_tile_size: true } },
    '11': { class_type: 'HyVideoSampler', inputs: { model: ['1', 0], hyvid_embeds: ['8', 0], width: size, height: size, num_frames: frames, steps: 30, embedded_guidance_scale: 6.0, flow_shift: 7.0, seed, force_offload: true, image_cond_latents: ['10', 0], scheduler: 'FlowMatchDiscreteScheduler' } },
    '12': { class_type: 'HyVideoDecode', inputs: { vae: ['9', 0], samples: ['11', 0], enable_vae_tiling: true, temporal_tiling_sample_size: 64, spatial_tile_sample_min_size: 256, auto_tile_size: true } },
    '13': { class_type: 'SaveWEBM', inputs: { images: ['12', 0], filename_prefix: 't2m_custom', codec: 'vp9', fps: 16.0, crf: 28.0 } },
  };
}

function ffmpegToMp4(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', input, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', output]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c + ': ' + err.slice(-200)))));
  });
}

export interface CustomResult { ok: boolean; mp4Path?: string; error?: string }

/**
 * Génère une vidéo sujet-driven. `imageBuf` = image de référence du sujet (JPEG/PNG, toute taille
 * → redimensionnée en carré côté GPU). Écrit le MP4 dans `outDir/outName.mp4`. ~3-4 min GPU.
 */
export async function hunyuanCustomVideo(opts: {
  imageBuf: Buffer;
  prompt: string;
  outDir: string;
  outName: string;
  size?: number;
  frames?: number;
  seed?: number;
}): Promise<CustomResult> {
  const { imageBuf, prompt, outDir, outName } = opts;
  const size = opts.size ?? 512, frames = opts.frames ?? 49;
  const seed = opts.seed ?? (Date.now() % 1_000_000_000);
  const base = COMFY.replace(/\/$/, '');

  let name = '';
  try {
    const fd = new FormData();
    fd.append('image', new Blob([new Uint8Array(imageBuf)], { type: 'image/png' }), `t2m_ref_${seed}.png`);
    fd.append('overwrite', 'true');
    const up = await fetch(`${base}/upload/image`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) });
    if (!up.ok) return { ok: false, error: 'gpu_unavailable' };
    const uj = await up.json();
    name = String(uj?.name || '');
    if (uj?.subfolder) name = `${uj.subfolder}/${name}`;
    if (!name) return { ok: false, error: 'upload_failed' };
  } catch { return { ok: false, error: 'gpu_unavailable' }; }

  let promptId = '';
  try {
    const sub = await fetch(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph(name, prompt, seed, size, frames) }), signal: AbortSignal.timeout(30000) });
    if (!sub.ok) return { ok: false, error: 'submit_failed' };
    promptId = String((await sub.json())?.prompt_id || '');
    if (!promptId) return { ok: false, error: 'submit_failed' };
  } catch { return { ok: false, error: 'submit_failed' }; }

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

  const tmp = path.join(os.tmpdir(), `t2m_custom_${seed}.webm`);
  try {
    const qs = new URLSearchParams({ filename: outFile.filename, subfolder: outFile.subfolder, type: outFile.type });
    const v = await fetch(`${base}/view?${qs.toString()}`, { signal: AbortSignal.timeout(60000) });
    if (!v.ok) return { ok: false, error: 'fetch_failed' };
    await writeFile(tmp, Buffer.from(await v.arrayBuffer()));
    await mkdir(outDir, { recursive: true });
    const mp4Path = path.join(outDir, `${outName}.mp4`);
    await ffmpegToMp4(tmp, mp4Path);
    await readFile(mp4Path);
    return { ok: true, mp4Path };
  } catch (e) {
    return { ok: false, error: 'finalize_failed:' + String((e as Error)?.message || '').slice(0, 80) };
  } finally {
    unlink(tmp).catch(() => {});
  }
}
