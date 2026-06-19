'use server-only';

/**
 * Client du Worker GPU Talk2Me (notre propre machine, modèles open).
 * Si GPU_WORKER_URL est configuré, le Studio génère images/voix CHEZ NOUS
 * (illimité, sans clé, indépendant) au lieu de fal/HF/ElevenLabs.
 * Sinon, ces fonctions renvoient null → fallback automatique sur l'existant.
 */

import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { normalizeForSpeech } from '@/lib/ai-video/speech-text';
import { hunyuanImageToVideo } from '@/lib/ai-video/hunyuan-i2v';

const IMG_DIR = process.cwd() + '/public/uploads/aivid-gen';
const TTS_DIR = process.cwd() + '/public/uploads/tts';
const MOTION_DIR = process.cwd() + '/public/uploads/aivid-motion';

export function gpuWorkerAvailable(): boolean {
  return !!process.env.GPU_WORKER_URL;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GPU_WORKER_TOKEN) h.Authorization = `Bearer ${process.env.GPU_WORKER_TOKEN}`;
  return h;
}

/** Texte via NOTRE GPU (Ollama/Llama) — remplace DeepSeek. Retourne le texte ou null. */
export async function gpuLlm(prompt: string, opts?: { system?: string; json?: boolean; temperature?: number }): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || !prompt.trim()) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/llm`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ prompt, system: opts?.system || '', json: !!opts?.json, temperature: opts?.temperature ?? 0.7 }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { text?: string };
    return d.text?.trim() || null;
  } catch { return null; }
}

/** OREILLES : audio → texte sur NOTRE GPU (faster-whisper /stt). audio_b64 brut
 *  (sans préfixe data:). Retourne la transcription ou null. */
export async function gpuStt(audioB64: string, lang = 'fr'): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || !audioB64) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/stt`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ audio_b64: audioB64, lang }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { text?: string };
    return d.text?.trim() || null;
  } catch { return null; }
}

/** YEUX : décrit/analyse une image sur NOTRE GPU (Qwen2.5-VL). image_b64 brut
 *  (sans préfixe data:). Retourne le texte (souvent JSON si demandé) ou null. */
export async function gpuVision(imageB64: string, prompt: string): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || !imageB64) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/vision`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ image_b64: imageB64, prompt }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { text?: string };
    return d.text?.trim() || null;
  } catch { return null; }
}

/** Génère une image sur NOTRE GPU (FLUX). Retourne le chemin local ou null. */
export async function gpuImage(prompt: string, portrait: boolean): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || !prompt.trim()) return null;
  const [w, h] = portrait ? [768, 1344] : [1344, 768];
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/image`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ prompt, width: w, height: h, steps: 4 }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 2048) return null;
    if (!existsSync(IMG_DIR)) await mkdir(IMG_DIR, { recursive: true });
    const out = path.join(IMG_DIR, `${randomUUID()}.png`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/**
 * Reproduction par RÉFÉRENCE (img2img) sur NOTRE GPU — « le livre de recettes ».
 * On donne une vraie photo (chemin local OU url) comme MODÈLE, le moteur la
 * reproduit (image à nous, libre de droit). `strength` faible = fidèle.
 * Retourne le chemin PNG local ou null.
 */
export async function gpuImg2img(
  ref: { path?: string; url?: string },
  prompt: string,
  portrait: boolean,
  strength = 0.45,
): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || (!ref.path && !ref.url)) return null;
  const [w, h] = portrait ? [768, 1344] : [1344, 768];
  const body: Record<string, unknown> = { prompt, width: w, height: h, strength, steps: 8 };
  if (ref.url) body.image_url = ref.url;
  else if (ref.path) {
    try { body.image_b64 = (await readFile(ref.path)).toString('base64'); } catch { return null; }
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/img2img`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 2048) return null;
    if (!existsSync(IMG_DIR)) await mkdir(IMG_DIR, { recursive: true });
    const out = path.join(IMG_DIR, `i2i-${randomUUID()}.png`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

const CUTOUT_DIR = process.cwd() + '/public/uploads/cutouts';

/**
 * Détourage produit sur NOTRE GPU (rembg) : enlève le fond → PNG transparent
 * recadré sur le sujet. Entrée = URL image (téléchargée côté worker) OU base64.
 * Retourne le chemin PNG local (/uploads/cutouts/...) ou null.
 */
export async function gpuCutout(input: { url?: string; b64?: string }): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || (!input.url && !input.b64)) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/cutout`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ image_url: input.url, image_b64: input.b64 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 512) return null;
    if (!existsSync(CUTOUT_DIR)) await mkdir(CUTOUT_DIR, { recursive: true });
    const out = path.join(CUTOUT_DIR, `${randomUUID()}.png`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

const AVATAR_DIR = process.cwd() + '/public/uploads';

/**
 * Avatar parlant (lip-sync) sur NOTRE GPU — endpoint worker `/avatar`
 * (LivePortrait/Wav2Lip). Entrée : un VISAGE (image, chemin local ou url) + une
 * VOIX (wav local). Sortie : une vidéo tête parlante synchronisée (mp4 local).
 * Repli gracieux : si l'endpoint n'existe pas encore (404) ou échoue → null,
 * et `renderProject` retombe sur le montage image+voix sans rien casser.
 */
export async function gpuAvatar(
  face: { path?: string; url?: string },
  audioPath: string,
  portrait = true,
): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || (!face.path && !face.url) || !audioPath) return null;
  const [w, h] = portrait ? [768, 1344] : [1344, 768];
  const body: Record<string, unknown> = { width: w, height: h };
  try {
    if (face.url) body.face_url = face.url;
    else if (face.path) body.face_b64 = (await readFile(face.path)).toString('base64');
    body.audio_b64 = (await readFile(audioPath)).toString('base64');
  } catch { return null; }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/avatar`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
      signal: AbortSignal.timeout(240000),
    });
    if (!res.ok) return null;               // 404 = pas encore déployé → repli montage
    const d = (await res.json()) as { b64?: string; format?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 4096) return null;
    if (!existsSync(AVATAR_DIR)) await mkdir(AVATAR_DIR, { recursive: true });
    const out = path.join(AVATAR_DIR, `lea-${randomUUID()}.mp4`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/**
 * Avatar HD (Léa qui BOUGE et PARLE) — endpoint worker `/avatar_hd`.
 * Chaîne : visage → LivePortrait (mouvement tête/regard) → MuseTalk (lèvres HD synchro voix).
 * Entrée : VISAGE (path/url) + VOIX (wav local). Sortie : mp4 local présentateur HD.
 * Repli gracieux : null si endpoint absent/échec → l'appelant retombe sur gpuAvatar (Wav2Lip) puis montage.
 */
export async function gpuAvatarHd(
  face: { path?: string; url?: string },
  audioPath: string,
  portrait = true,
): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || (!face.path && !face.url) || !audioPath) return null;
  const [w, h] = portrait ? [768, 1344] : [1344, 768];
  const body: Record<string, unknown> = { width: w, height: h };
  try {
    if (face.url) body.face_url = face.url;
    else if (face.path) body.face_b64 = (await readFile(face.path)).toString('base64');
    body.audio_b64 = (await readFile(audioPath)).toString('base64');
  } catch { return null; }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/avatar_hd`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 4096) return null;
    if (!existsSync(AVATAR_DIR)) await mkdir(AVATAR_DIR, { recursive: true });
    const out = path.join(AVATAR_DIR, `leahd-${randomUUID()}.mp4`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/**
 * VOIX 100% CHEZ NOUS — XTTS-v2 sur NOTRE GPU via un service TTS DÉDIÉ (XTTS_URL, tunnel
 * vers le pod). Chemin SÉPARÉ de GPU_WORKER_URL exprès : ne fait PAS passer images/LLM par
 * un worker absent (zéro effet de bord sur le composer). Retourne le .wav local ou null. (Pascal 2026-06-18)
 */
export async function gpuXtts(text: string, lang = 'fr'): Promise<string | null> {
  // Défaut sur le tunnel local (comme COMFY_URL) → pas besoin d'éditer l'env ; si le
  // service XTTS n'écoute pas, le fetch échoue vite → repli edge-tts en amont.
  const base = process.env.XTTS_URL || 'http://127.0.0.1:8190';
  if (!base || !text.trim()) return null;
  const spoken = normalizeForSpeech(text.trim(), lang);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken.slice(0, 800), lang }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string; format?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 256) return null;
    if (!existsSync(TTS_DIR)) await mkdir(TTS_DIR, { recursive: true });
    const out = path.join(TTS_DIR, `xtts-${randomUUID()}.${d.format === 'wav' ? 'wav' : 'mp3'}`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/** Voix sur NOTRE GPU (XTTS) via le worker complet GPU_WORKER_URL. Retourne le chemin mp3/wav local ou null. */
export async function gpuTts(text: string, lang = 'fr', speakerWav?: string): Promise<string | null> {
  const base = process.env.GPU_WORKER_URL;
  if (!base || !text.trim()) return null;
  const spoken = normalizeForSpeech(text.trim(), lang);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/tts`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ text: spoken.slice(0, 800), lang, speaker_wav: speakerWav }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { b64?: string; format?: string };
    if (!d.b64) return null;
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 256) return null;
    if (!existsSync(TTS_DIR)) await mkdir(TTS_DIR, { recursive: true });
    const out = path.join(TTS_DIR, `gpu-${randomUUID()}.${d.format === 'wav' ? 'wav' : 'mp3'}`);
    await writeFile(out, buf);
    return out;
  } catch { return null; }
}

/**
 * MOTION — anime une image fixe de scène en clip vidéo via I2V sur NOTRE GPU (HunyuanVideo I2V,
 * préserve l'image = préserve l'histoire). `imagePath` = chemin disque de l'image de scène.
 * Retourne le chemin du .mp4 local ou null (repli gracieux : montage retombe sur l'image fixe).
 * Pascal 2026-06-18 — cœur de la fusion composer × moteur vidéo.
 */
export async function gpuMotion(imagePath: string, prompt: string, portrait: boolean, seed: number): Promise<string | null> {
  try {
    const buf = await readFile(imagePath);
    const name = `motion-${randomUUID().slice(0, 12)}`;
    const r = await hunyuanImageToVideo({
      imageBuf: buf,
      prompt: prompt || 'subtle natural motion, cinematic, photorealistic',
      outDir: MOTION_DIR,
      outName: name,
      // VRAI 9:16 (432×768) pour remplir le montage portrait sans bandes grises (Pascal 2026-06-19).
      width: portrait ? 432 : 768,
      height: portrait ? 768 : 432,
      length: 33,            // ~2 s @16fps (vitesse : audit Pascal 2026-06-18)
      seed,
    });
    return r.ok && r.mp4Path ? r.mp4Path : null;
  } catch { return null; }
}
