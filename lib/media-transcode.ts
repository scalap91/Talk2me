'use server-only';
/**
 * Talk2Me — garantit qu'un fichier audio uploadé est LISIBLE PAR LE WEB (Pascal 2026-09-08).
 * Bug « Over orizon » : le .m4a source était en E-AC-3 (Dolby Digital+), que les navigateurs NE
 * DÉCODENT PAS dans <audio> (codec licencié). ExoPlayer natif le lit → « ça joue en natif, pas en
 * web ». Fix : à la PUBLICATION, si la piste n'est pas dans un codec web (aac/mp3/opus/vorbis/flac),
 * on la transcode en AAC stéréo (ffmpeg) → nouveau fichier /uploads, web ET natif jouent.
 *
 * Best-effort : si ffprobe/ffmpeg manquent ou échouent, on renvoie l'URL d'origine (jamais bloquer
 * une publication). Idempotent côté produit : un fichier déjà AAC n'est PAS retouché (ffprobe rapide).
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';

const exec = promisify(execFile);
const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');

// Codecs audio que les navigateurs décodent nativement dans <audio> (pas d'EAC3/AC3/DTS/TrueHD…).
const WEB_AUDIO_CODECS = new Set(['aac', 'mp3', 'mp2', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'alac']);

/** /uploads/<name> → chemin disque absolu, borné à UPLOAD_DIR (anti-traversée). null si hors zone. */
function toDisk(url: string): string | null {
  if (!url.startsWith('/uploads/')) return null;
  const full = path.resolve(UPLOAD_DIR, ...url.slice('/uploads/'.length).split('/'));
  if (full !== UPLOAD_DIR && !full.startsWith(UPLOAD_DIR + path.sep)) return null;
  return full;
}

/** Codec audio du 1er flux audio (ou null si indéterminable). */
async function audioCodec(disk: string): Promise<string | null> {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', disk,
    ], { timeout: 20000 });
    const c = stdout.trim().split('\n')[0]?.trim().toLowerCase();
    return c || null;
  } catch { return null; }
}

/**
 * Rend une URL audio /uploads/... web-compatible. Renvoie l'URL d'origine si déjà OK (ou si on ne
 * peut pas prouver le contraire) ; sinon transcode en AAC .m4a et renvoie la NOUVELLE URL /uploads.
 */
export async function ensureWebAudio(url: unknown): Promise<string | null> {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return typeof url === 'string' ? url : null;
  const disk = toDisk(url);
  if (!disk) return url;
  try { if (!(await stat(disk)).isFile()) return url; } catch { return url; }

  const codec = await audioCodec(disk);
  if (!codec) return url;                       // ffprobe indispo → on ne touche pas
  if (WEB_AUDIO_CODECS.has(codec)) return url;  // déjà lisible par le web → rien à faire

  // Codec non-web (ex: eac3/ac3/dts) → transcode AAC stéréo, faststart (moov au début = lecture progressive).
  const outName = `${randomUUID()}.m4a`;
  const outDisk = path.join(UPLOAD_DIR, outName);
  try {
    await exec('ffmpeg', [
      '-v', 'error', '-y', '-i', disk,
      '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-movflags', '+faststart', outDisk,
    ], { timeout: 180000 });
    return `/uploads/${outName}`;
  } catch {
    return url; // transcodage KO → on garde l'original (jouera au moins en natif)
  }
}
