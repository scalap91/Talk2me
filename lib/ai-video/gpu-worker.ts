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

const IMG_DIR = '/home/ubuntu/talktome/public/uploads/aivid-gen';
const TTS_DIR = '/home/ubuntu/talktome/public/uploads/tts';

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

const CUTOUT_DIR = '/home/ubuntu/talktome/public/uploads/cutouts';

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

const AVATAR_DIR = '/home/ubuntu/talktome/public/uploads';

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

/** Voix sur NOTRE GPU (XTTS). Retourne le chemin mp3/wav local ou null. */
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
