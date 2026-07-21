/**
 * /home/ubuntu/talktome/lib/ffmpeg-helpers.ts
 *
 * Wrappers ffmpeg pour le baking serveur de VideoCard (Phase B).
 *
 * Principe :
 *  - Le client édite sans toucher au fichier source (trim/cover/texts en preview CSS).
 *  - Au "Publier" → /api/cards/editor/apply-video-ops appelle ces helpers pour
 *    produire la version finale + la cover JPG.
 *  - Pas de baking pendant l'édition. Pas de spam ffmpeg en preview.
 *
 * Stratégie ffmpeg :
 *  - Trim : `-ss start -to end -c copy` (rapide, copy stream).
 *    Si imprécis (keyframes), fallback réencodage libx264 ultrafast.
 *  - Drawtext : réencodage obligatoire avec filter drawtext.
 *    Combinaison de plusieurs drawtext via `,` dans -vf.
 *  - Cover : extraction d'une seule frame `-vframes 1 -q:v 2`.
 *  - Timeout : 5 min par étape (sécurité).
 */

import { spawn } from 'child_process';
import path from 'path';
import { mkdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { filterFfmpeg, type FilterPreset } from './video-filters';

const FFMPEG_BIN = 'ffmpeg';
const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min / étape
/**
 * Talk2Me #421 — résolution standard pour normaliser les clips avant concat.
 * Tous les clips sont scalés à ce canvas (vertical 9:16 dominant Talk2Me).
 * Évite les erreurs "samples don't match" du concat demuxer / xfade.
 */
const NORMALIZE_WIDTH = 720;
const NORMALIZE_HEIGHT = 1280;
const NORMALIZE_FPS = 30;
const NORMALIZE_AR = 48000;

export interface VideoTextOp {
  content: string;
  position: 'top' | 'center' | 'bottom';
  /** Début d'affichage du texte (s), null = depuis le début. */
  start_s?: number | null;
  /** Fin d'affichage du texte (s), null = jusqu'à la fin. */
  end_s?: number | null;
}

/**
 * Talk2Me #420 — mix audio sur vidéo via ffmpeg.
 * volumes en 0–100 (mappés ÷100). audio_offset_sec = délai avant que la
 * musique commence dans la vidéo.
 */
export interface VideoAudioOp {
  /** Chemin absolu du fichier audio (mp3/m4a/wav). */
  audioPath: string;
  /** Volume vidéo originale (0–100). */
  videoVolume: number;
  /** Volume musique ajoutée (0–100). */
  audioVolume: number;
  /** Délai avant début musique (s, ≥ 0). */
  audioOffsetSec: number;
  /** True si la vidéo source n'a pas de piste audio. */
  videoHasNoAudio?: boolean;
}

export interface VideoApplyResult {
  /** Chemin absolu du fichier vidéo final dans /uploads/. */
  finalVideoPath: string;
  /** URL publique /uploads/xxx.mp4. */
  finalVideoUrl: string;
  /** Chemin absolu de la cover. */
  coverPath: string;
  /** URL publique /uploads/xxx.jpg. */
  coverUrl: string;
  /** Durée finale (s). */
  durationS: number;
  /** Étapes exécutées (debug/observability). */
  steps: string[];
}

/* ----------------------------------------------------------------------- */
/* spawn ffmpeg avec capture stderr, timeout, et propagation des erreurs.   */
/* ----------------------------------------------------------------------- */

function runFfmpeg(args: string[], label: string): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let killed = false;

    const to = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, STEP_TIMEOUT_MS);

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(to);
      reject(new Error(`ffmpeg ${label} spawn error: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(to);
      if (killed) {
        reject(new Error(`ffmpeg ${label} timed out after ${STEP_TIMEOUT_MS / 1000}s`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg ${label} exit ${code}\n${stderr.split('\n').slice(-15).join('\n')}`
          )
        );
        return;
      }
      resolve({ stderr });
    });
  });
}

function runFfprobeDuration(inputPath: string): Promise<number> {
  // Utilise ffmpeg lui-même (pas besoin d'ajouter ffprobe). Parse stderr "Duration: HH:MM:SS.cc".
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ['-i', inputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) {
        reject(new Error('ffmpeg: could not parse duration'));
        return;
      }
      const h = parseInt(m[1], 10);
      const mn = parseInt(m[2], 10);
      const s = parseFloat(m[3]);
      resolve(h * 3600 + mn * 60 + s);
    });
    child.on('error', (err) => reject(err));
  });
}

/* ----------------------------------------------------------------------- */
/* Échappement texte pour drawtext (single quotes + backslash).             */
/* drawtext sépare les filtres par `,` et les options par `:`. Donc tout    */
/* `:` et `,` dans le texte doit être protégé. La méthode safe : passer     */
/* le texte entre `'…'` et échapper `\` `'` `:` `,` `%` `\n`.                */
/* ----------------------------------------------------------------------- */

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

/* ----------------------------------------------------------------------- */
/* Construit la chaîne -vf à partir de N textes overlay.                    */
/* Position : top=y=60 ; center=y=(h-text_h)/2 ; bottom=y=h-text_h-60.       */
/* Centrage horizontal : x=(w-text_w)/2.                                    */
/* Durée d'affichage : enable='between(t,start,end)' si start/end fournis.  */
/* ----------------------------------------------------------------------- */

function buildDrawtextFilter(texts: VideoTextOp[]): string {
  const parts: string[] = [];
  for (const t of texts) {
    const txt = escapeDrawtext(t.content.slice(0, 80));
    if (!txt) continue;
    let y: string;
    if (t.position === 'top') y = '60';
    else if (t.position === 'bottom') y = 'h-text_h-60';
    else y = '(h-text_h)/2';

    const enableParts: string[] = [];
    if (typeof t.start_s === 'number' || typeof t.end_s === 'number') {
      const a = typeof t.start_s === 'number' ? Math.max(0, t.start_s) : 0;
      const b = typeof t.end_s === 'number' ? Math.max(a + 0.1, t.end_s) : null;
      if (b !== null) {
        enableParts.push(`enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`);
      } else {
        enableParts.push(`enable='gte(t,${a.toFixed(3)})'`);
      }
    }

    const segs = [
      `drawtext=fontfile=${FONT_PATH}`,
      `text='${txt}'`,
      `x=(w-text_w)/2`,
      `y=${y}`,
      `fontsize=48`,
      `fontcolor=white`,
      `borderw=3`,
      `bordercolor=black@0.85`,
      `box=1`,
      `boxcolor=black@0.35`,
      `boxborderw=12`,
      ...enableParts,
    ];
    parts.push(segs.join(':'));
  }
  return parts.join(',');
}

/* ----------------------------------------------------------------------- */
/* applyVideoOps — pipeline complet : trim → drawtext → cover.              */
/* ----------------------------------------------------------------------- */

export interface ApplyVideoOpsInput {
  /**
   * Chemin absolu source dans /uploads/.
   * Talk2Me #421 — utilisé uniquement si `multiClips` n'est PAS fourni (mode
   * legacy 1-clip). Pour multi-clips, fournir `multiClips.clips[]`.
   */
  sourcePath: string;
  /** Répertoire de sortie (= /home/ubuntu/talktome/public/uploads). */
  outDir: string;
  /** Prefix URL public (= /uploads). */
  publicPrefix: string;
  /**
   * Trim demandé. Ignoré si multiClips fourni (chaque clip a son trim).
   */
  trim?: { start_s: number; end_s: number } | null;
  /** Cover timestamp dans la vidéo FINALE (post-trim/concat). */
  coverTimeS?: number | null;
  /** Textes overlay. */
  texts: VideoTextOp[];
  /** Bande son ajoutée (Talk2Me #420). null = pas de mix audio. */
  audio?: VideoAudioOp | null;
  /**
   * Talk2Me #421 — pipeline multi-clips.
   * Si fourni, prime sur sourcePath/trim. clips[].sourcePath doit déjà
   * être un chemin absolu résolu côté caller (anti path-traversal).
   */
  multiClips?: MultiClipsInput | null;
}

/* ----------------------------------------------------------------------- */
/* Détecte si une vidéo a une piste audio. Parse stderr `Stream #...Audio`. */
/* ----------------------------------------------------------------------- */

export function hasAudioStream(inputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG_BIN, ['-i', inputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', () => {
      resolve(/Stream #\d+:\d+(?:\([^)]+\))?: Audio/i.test(stderr));
    });
    child.on('error', () => resolve(false));
  });
}

/* ----------------------------------------------------------------------- */
/* Détecte les codecs (video/audio) d'un fichier via `ffmpeg -i` (stderr).  */
/* ----------------------------------------------------------------------- */

function probeCodecs(inputPath: string): Promise<{ video?: string; audio?: string }> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG_BIN, ['-i', inputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', () => {
      const v = stderr.match(/:\s*Video:\s*([a-z0-9_]+)/i);
      const a = stderr.match(/:\s*Audio:\s*([a-z0-9_]+)/i);
      resolve({ video: v?.[1]?.toLowerCase(), audio: a?.[1]?.toLowerCase() });
    });
    child.on('error', () => resolve({}));
  });
}

/* ----------------------------------------------------------------------- */
/* ensureNativePlayable — garantit qu'une vidéo MP4/MOV est LISIBLE en      */
/* NATIF (Android ExoPlayer + iOS AVPlayer), pas seulement dans un          */
/* navigateur. Le composer web produit souvent de l'audio OPUS dans un      */
/* conteneur MP4 : Chrome le lit, mais les lecteurs natifs échouent →       */
/* « Vidéo illisible ». Fix : audio → AAC (universel). La vidéo h264 est    */
/* COPIÉE (rapide, sans perte) ; seule une vidéo non-h264 est réencodée.    */
/* Idempotent : ne fait rien si déjà h264/AAC. Best-effort côté appelant.   */
/* ----------------------------------------------------------------------- */

export async function ensureNativePlayable(
  filePath: string
): Promise<{ converted: boolean; from?: string }> {
  const { video, audio } = await probeCodecs(filePath);
  // Rien à décoder (probe échouée / pas de flux) → on ne touche pas.
  if (!video && !audio) return { converted: false };
  const audioBad = !!audio && audio !== 'aac';          // opus, vorbis, ac3… → AAC
  const videoBad = !!video && video !== 'h264';         // vp9, hevc, av1… → h264
  if (!audioBad && !videoBad) return { converted: false };

  const ext = path.extname(filePath) || '.mp4';
  const tmp = path.join(path.dirname(filePath), `.tmp_native_${randomUUID()}${ext}`);
  const args = ['-y', '-i', filePath];
  args.push('-c:v', videoBad ? 'libx264' : 'copy');
  if (videoBad) args.push('-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', tmp);
  try {
    await runFfmpeg(args, `native-normalize (v=${video ?? '-'} a=${audio ?? '-'})`);
    await rename(tmp, filePath); // remplace l'original en place (même URL)
    return { converted: true, from: `v=${video ?? '-'} a=${audio ?? '-'}` };
  } catch (err) {
    try { await unlink(tmp); } catch { /* noop */ }
    throw err;
  }
}

/* ----------------------------------------------------------------------- */
/* mixAudioOnVideo — ajoute une bande son sur la vidéo.                    */
/*                                                                          */
/* Stratégie filter_complex :                                               */
/*  - Si vidéo a audio : amix(video_audio*vol, music*vol+delay)            */
/*  - Si vidéo sans audio : on prend juste music*vol+delay                 */
/*  - Loop musique : `-stream_loop -1` sur l'input audio (au niveau         */
/*    démuxeur, plus fiable que aloop dans le filter_complex). Le shortest  */
/*    final tronque alors sur la durée vidéo.                               */
/* ----------------------------------------------------------------------- */

export async function mixAudioOnVideo(
  inputVideoPath: string,
  outputPath: string,
  op: VideoAudioOp
): Promise<void> {
  const vv = Math.max(0, Math.min(100, op.videoVolume)) / 100;
  const av = Math.max(0, Math.min(100, op.audioVolume)) / 100;
  const offsetMs = Math.max(0, Math.round(op.audioOffsetSec * 1000));

  // Détecte si la vidéo a une piste audio si pas fourni explicitement
  const videoHasAudio = op.videoHasNoAudio === true ? false : await hasAudioStream(inputVideoPath);

  // Construit la chaîne musique : volume + (optionnel) adelay
  const musicChain: string[] = [`volume=${av.toFixed(3)}`];
  if (offsetMs > 0) {
    musicChain.unshift(`adelay=${offsetMs}|${offsetMs}`);
  }

  let filter: string;
  if (videoHasAudio) {
    // Mix piste vidéo + piste musique (loop input)
    filter =
      `[0:a]volume=${vv.toFixed(3)}[v_audio];` +
      `[1:a]${musicChain.join(',')}[m_audio];` +
      `[v_audio][m_audio]amix=inputs=2:duration=first:dropout_transition=2[out]`;
  } else {
    // Vidéo muette : on prend juste la musique
    filter = `[1:a]${musicChain.join(',')}[out]`;
  }

  await runFfmpeg(
    [
      '-y',
      '-i', inputVideoPath,
      '-stream_loop', '-1',
      '-i', op.audioPath,
      '-filter_complex', filter,
      '-map', '0:v',
      '-map', '[out]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ],
    `mix audio (vol v=${vv} a=${av} offset=${offsetMs}ms hasAudio=${videoHasAudio})`
  );
}

/* ----------------------------------------------------------------------- */
/* Talk2Me #421 — concat multi-clips + filtres par-clip + transitions.       */
/* ----------------------------------------------------------------------- */

export interface ConcatClipInput {
  /** Chemin absolu source du clip (déjà résolu côté caller). */
  sourcePath: string;
  /** Sous-segment utilisé (s, dans le clip source). */
  trimStartSec: number;
  trimEndSec: number;
  /** Filtre couleur appliqué à CE clip. null/undefined = aucun. */
  filter?: FilterPreset | null;
}

export interface ConcatTransitionInput {
  type: 'cut' | 'fade';
  /** Durée transition en ms (cut=0, fade=200–500). */
  durationMs: number;
}

/**
 * Normalise un clip à un canvas commun (résolution + fps + sample rate audio)
 * + applique le filtre couleur + trim. Sortie = mp4 H264 / AAC. Cette étape
 * est OBLIGATOIRE avant un concat demuxer / xfade pour éviter les erreurs
 * de mismatch de codec.
 */
async function normalizeClip(
  input: ConcatClipInput,
  outputPath: string,
  label: string
): Promise<void> {
  const s = Math.max(0, input.trimStartSec).toFixed(3);
  const e = Math.max(input.trimStartSec + 0.1, input.trimEndSec).toFixed(3);
  const filterChain = input.filter ? filterFfmpeg(input.filter) : '';
  // Construit la chaîne -vf : scale + sar=1 + fps + (filtre couleur).
  const vfParts = [
    `scale=${NORMALIZE_WIDTH}:${NORMALIZE_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${NORMALIZE_WIDTH}:${NORMALIZE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    `setsar=1`,
    `fps=${NORMALIZE_FPS}`,
  ];
  if (filterChain) vfParts.push(filterChain);
  const vf = vfParts.join(',');

  // Audio : on resample à NORMALIZE_AR + stereo. Si la source n'a pas
  // d'audio, on injecte un silence (anullsrc) pour avoir une piste.
  const hasAudio = await hasAudioStream(input.sourcePath);
  if (hasAudio) {
    await runFfmpeg(
      [
        '-y',
        '-ss', s,
        '-to', e,
        '-i', input.sourcePath,
        '-vf', vf,
        '-af', `aresample=${NORMALIZE_AR}:async=1`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-r', String(NORMALIZE_FPS),
        '-c:a', 'aac',
        '-ar', String(NORMALIZE_AR),
        '-ac', '2',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
      ],
      `normalize ${label}`
    );
  } else {
    // Génère un silence en même temps que la vidéo
    await runFfmpeg(
      [
        '-y',
        '-ss', s,
        '-to', e,
        '-i', input.sourcePath,
        '-f', 'lavfi',
        '-t', (parseFloat(e) - parseFloat(s)).toFixed(3),
        '-i', `anullsrc=channel_layout=stereo:sample_rate=${NORMALIZE_AR}`,
        '-vf', vf,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-r', String(NORMALIZE_FPS),
        '-c:a', 'aac',
        '-ar', String(NORMALIZE_AR),
        '-ac', '2',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath,
      ],
      `normalize+silence ${label}`
    );
  }
}

/**
 * Concat de N clips avec transitions cut/fade.
 *
 * Stratégie :
 *  - Tous les clips sont d'abord normalisés (scale+fps+sar+filter) en
 *    fichiers temporaires.
 *  - Si TOUTES les transitions sont 'cut' → concat demuxer (rapide, juste
 *    un fichier .txt + concat).
 *  - Sinon → filter_complex xfade (fade) entre chaque paire successive.
 *    On chaîne : [v0][v1]xfade=transition=fade:duration=D:offset=O[v01];
 *               [v01][v2]xfade=...
 *    Et acrossfade pour l'audio.
 *
 * Retourne le path mp4 concaténé.
 */
export async function concatClips(
  clips: ConcatClipInput[],
  transitions: ConcatTransitionInput[],
  outputPath: string,
  workDir: string
): Promise<{ steps: string[] }> {
  const steps: string[] = [];
  if (clips.length === 0) {
    throw new Error('concatClips: empty clips array');
  }

  if (!existsSync(workDir)) {
    await mkdir(workDir, { recursive: true });
  }

  // 1) Normalise chaque clip
  const normalizedPaths: string[] = [];
  const segDurations: number[] = []; // durées trimmed
  for (let i = 0; i < clips.length; i++) {
    const tmp = path.join(workDir, `.tmp_clip_${randomUUID()}.mp4`);
    await normalizeClip(clips[i], tmp, `clip ${i + 1}/${clips.length}`);
    normalizedPaths.push(tmp);
    const dur = Math.max(0.1, clips[i].trimEndSec - clips[i].trimStartSec);
    segDurations.push(dur);
    steps.push(`normalize clip${i + 1} (${dur.toFixed(2)}s${clips[i].filter ? ' +' + clips[i].filter : ''})`);
  }

  // Cas trivial : 1 seul clip
  if (clips.length === 1) {
    await rename(normalizedPaths[0], outputPath);
    steps.push('single clip (no concat)');
    return { steps };
  }

  // Détermine si on est full-cut ou mix avec fades
  const hasFade = transitions.some(
    (t) => t.type === 'fade' && t.durationMs > 0
  );

  if (!hasFade) {
    // ----- Concat demuxer (rapide, sans réencode) -----
    const listFile = path.join(workDir, `.tmp_concat_${randomUUID()}.txt`);
    const fs = await import('fs/promises');
    const lines = normalizedPaths.map((p) => `file '${p.replace(/'/g, "\\'")}'`);
    await fs.writeFile(listFile, lines.join('\n'), 'utf8');
    try {
      await runFfmpeg(
        [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c', 'copy',
          '-movflags', '+faststart',
          outputPath,
        ],
        `concat demuxer (${clips.length} cuts)`
      );
      steps.push(`concat demuxer ${clips.length} clips (cut)`);
    } catch (err) {
      // Fallback : réencode
      console.warn('[ffmpeg-helpers] concat demuxer failed, fallback xfade reencode:', err);
      await runFfmpeg(
        [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          outputPath,
        ],
        `concat demuxer reencode`
      );
      steps.push(`concat demuxer reencode ${clips.length} clips`);
    } finally {
      try { await unlink(listFile); } catch { /* noop */ }
    }
  } else {
    // ----- xfade pipeline -----
    // On charge tous les inputs, puis on chaîne xfade + acrossfade.
    const inputs: string[] = [];
    for (const p of normalizedPaths) {
      inputs.push('-i', p);
    }

    // Build filter_complex
    // Pour chaque transition i (entre clip i et clip i+1) :
    //   offset_i = sum(segDurations[0..i]) - cumul des durées xfade précédentes
    // En pratique : avec xfade duration=D, la sortie a (segDur[i] + segDur[i+1] - D).
    // On cumule.
    const fcParts: string[] = [];
    let prevVLabel = '[0:v]';
    let prevALabel = '[0:a]';
    let cumulativeDur = segDurations[0];

    for (let i = 0; i < clips.length - 1; i++) {
      const t = transitions[i] ?? { type: 'cut', durationMs: 0 };
      const nextV = `[${i + 1}:v]`;
      const nextA = `[${i + 1}:a]`;
      const outV = `[v${i + 1}]`;
      const outA = `[a${i + 1}]`;
      const fadeD = t.type === 'fade' ? Math.max(0.1, t.durationMs / 1000) : 0;
      if (fadeD > 0) {
        // xfade attend offset = quand commencer la transition dans le 1er flux
        const offset = Math.max(0, cumulativeDur - fadeD);
        fcParts.push(
          `${prevVLabel}${nextV}xfade=transition=fade:duration=${fadeD.toFixed(3)}:offset=${offset.toFixed(3)}${outV}`
        );
        fcParts.push(
          `${prevALabel}${nextA}acrossfade=d=${fadeD.toFixed(3)}${outA}`
        );
        cumulativeDur = cumulativeDur + segDurations[i + 1] - fadeD;
      } else {
        // cut : on concat brutalement
        fcParts.push(
          `${prevVLabel}${nextV}concat=n=2:v=1:a=0${outV}`
        );
        fcParts.push(
          `${prevALabel}${nextA}concat=n=2:v=0:a=1${outA}`
        );
        cumulativeDur = cumulativeDur + segDurations[i + 1];
      }
      prevVLabel = outV;
      prevALabel = outA;
    }
    const filter = fcParts.join(';');

    await runFfmpeg(
      [
        '-y',
        ...inputs,
        '-filter_complex', filter,
        '-map', prevVLabel,
        '-map', prevALabel,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-r', String(NORMALIZE_FPS),
        '-c:a', 'aac',
        '-ar', String(NORMALIZE_AR),
        '-ac', '2',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
      ],
      `xfade concat ${clips.length} clips`
    );
    steps.push(`xfade concat ${clips.length} clips (${transitions.filter((t) => t.type === 'fade').length} fades)`);
  }

  // Cleanup intermédiaires
  for (const p of normalizedPaths) {
    if (existsSync(p)) {
      try { await unlink(p); } catch { /* noop */ }
    }
  }

  return { steps };
}

/**
 * Talk2Me #421 — entrée multi-clips pour applyVideoOps.
 * Si fournie, prime sur sourcePath / trim de l'ApplyVideoOpsInput hérité.
 */
export interface MultiClipsInput {
  clips: ConcatClipInput[];
  transitions: ConcatTransitionInput[];
}

export async function applyVideoOps(input: ApplyVideoOpsInput): Promise<VideoApplyResult> {
  const { sourcePath, outDir, publicPrefix } = input;
  // Mode multi-clips #421 : si on a clips[].length > 1 OU filtres par-clip,
  // on passe par concatClips. Sinon legacy path.
  const useMultiClips =
    !!input.multiClips &&
    input.multiClips.clips.length > 0 &&
    (input.multiClips.clips.length > 1 ||
      !!input.multiClips.clips[0].filter);

  if (!useMultiClips && !existsSync(sourcePath)) {
    throw new Error(`source not found: ${sourcePath}`);
  }
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const steps: string[] = [];
  const id = randomUUID();
  const tmpA = path.join(outDir, `.tmp_${id}_a.mp4`);
  const tmpB = path.join(outDir, `.tmp_${id}_b.mp4`);
  const tmpC = path.join(outDir, `.tmp_${id}_c.mp4`);
  const tmpConcat = path.join(outDir, `.tmp_${id}_concat.mp4`);
  const finalName = `${id}.mp4`;
  const coverName = `${id}.jpg`;
  const finalPath = path.join(outDir, finalName);
  const coverPath = path.join(outDir, coverName);

  let currentInput = sourcePath;

  // 0) Multi-clips #421 ----------------------------------------------
  if (useMultiClips && input.multiClips) {
    // Valide les clips existants
    for (const c of input.multiClips.clips) {
      if (!existsSync(c.sourcePath)) {
        throw new Error(`concat clip source not found: ${c.sourcePath}`);
      }
    }
    const r = await concatClips(
      input.multiClips.clips,
      input.multiClips.transitions,
      tmpConcat,
      outDir
    );
    steps.push(...r.steps);
    currentInput = tmpConcat;
    // En mode multi-clips, l'étape trim global est skippée (chaque clip a
    // déjà été trimmé par concatClips).
  } else if (input.trim && input.trim.end_s > input.trim.start_s) {
    const s = Math.max(0, input.trim.start_s).toFixed(3);
    const e = Math.max(input.trim.start_s + 0.1, input.trim.end_s).toFixed(3);
    // -ss avant -i = seek rapide ; -to = absolute end. Avec -c copy on garde
    // les streams sans réencoder. Précis au keyframe le plus proche.
    try {
      await runFfmpeg(
        ['-y', '-ss', s, '-to', e, '-i', currentInput, '-c', 'copy', '-movflags', '+faststart', tmpA],
        `trim copy ${s}→${e}`
      );
      steps.push(`trim copy ${s}→${e}`);
    } catch (err) {
      // Fallback réencodage si copy échoue
      console.warn('[ffmpeg-helpers] trim copy failed, fallback reencode:', err);
      await runFfmpeg(
        [
          '-y',
          '-ss', s,
          '-to', e,
          '-i', currentInput,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          tmpA,
        ],
        `trim reencode ${s}→${e}`
      );
      steps.push(`trim reencode ${s}→${e}`);
    }
    currentInput = tmpA;
  }

  // 2) Drawtext ------------------------------------------------------
  if (input.texts.length > 0) {
    const vf = buildDrawtextFilter(input.texts);
    if (vf) {
      await runFfmpeg(
        [
          '-y',
          '-i', currentInput,
          '-vf', vf,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          tmpB,
        ],
        `drawtext ${input.texts.length}`
      );
      steps.push(`drawtext ${input.texts.length}`);
      currentInput = tmpB;
    }
  }

  // 3) Audio mix (Talk2Me #420) -------------------------------------
  // Si on doit mixer une musique, on le fait ici (après trim+drawtext, avant rename final).
  if (input.audio && input.audio.audioPath) {
    // Si currentInput == sourcePath (aucun op précédent), on copie d'abord en tmpC
    // pour ne pas écraser la source. Sinon on lit currentInput → tmpC.
    await mixAudioOnVideo(currentInput, tmpC, input.audio);
    steps.push(
      `audio mix (v=${input.audio.videoVolume}% a=${input.audio.audioVolume}% off=${input.audio.audioOffsetSec.toFixed(2)}s)`
    );
    currentInput = tmpC;
  }

  // 4) Move/rename final vidéo --------------------------------------
  if (currentInput !== finalPath) {
    if (currentInput === sourcePath) {
      // Aucun op n'a touché la vidéo → on duplique pour avoir un fichier
      // dédié à la card (sans toucher l'upload source qui peut être
      // partagé). Copy stream-only sans réencodage.
      await runFfmpeg(
        ['-y', '-i', sourcePath, '-c', 'copy', '-movflags', '+faststart', finalPath],
        'remux passthrough'
      );
      steps.push('remux passthrough');
    } else {
      await rename(currentInput, finalPath);
      steps.push('rename final');
    }
  }

  // Cleanup intermédiaires
  for (const p of [tmpA, tmpB, tmpC, tmpConcat]) {
    if (p !== finalPath && existsSync(p)) {
      try {
        await unlink(p);
      } catch {
        // ignore
      }
    }
  }

  // 5) Cover frame --------------------------------------------------
  const duration = await runFfprobeDuration(finalPath);
  const coverT = (() => {
    let t = typeof input.coverTimeS === 'number' ? input.coverTimeS : 0;
    if (!isFinite(t) || t < 0) t = 0;
    if (t > duration - 0.05) t = Math.max(0, duration - 0.05);
    return t;
  })();
  await runFfmpeg(
    [
      '-y',
      '-ss', coverT.toFixed(3),
      '-i', finalPath,
      '-vframes', '1',
      '-q:v', '2',
      coverPath,
    ],
    `cover @${coverT.toFixed(3)}s`
  );
  steps.push(`cover @${coverT.toFixed(3)}s`);

  return {
    finalVideoPath: finalPath,
    finalVideoUrl: `${publicPrefix}/${finalName}`,
    coverPath,
    coverUrl: `${publicPrefix}/${coverName}`,
    durationS: duration,
    steps,
  };
}

/* ----------------------------------------------------------------------- */
/* Talk2Me multi-canal (Pascal 2026-06-10) — REFRAME : recadre une vidéo au   */
/* ratio d'un réseau (1:1 Insta · 9:16 TikTok/Reels/Story · 16:9 YouTube).    */
/* Crop "cover" centré (remplit sans bandes). Réencode h264/aac faststart.    */
/* ----------------------------------------------------------------------- */
const REFRAME_DIMS: Record<string, [number, number]> = {
  '1:1': [1080, 1080], '9:16': [1080, 1920], '16:9': [1920, 1080],
};

export async function reframeVideo(inputPath: string, ratio: '1:1' | '9:16' | '16:9'): Promise<{ url: string }> {
  const dims = REFRAME_DIMS[ratio];
  if (!dims) throw new Error('bad_ratio');
  const [w, h] = dims;
  const dir = process.cwd() + '/public/uploads';
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const name = `reframe-${randomUUID()}.mp4`;
  const out = path.join(dir, name);
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  await runFfmpeg(
    ['-i', inputPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', out],
    'reframe',
  );
  return { url: `/uploads/${name}` };
}

/** Exposé pour tests. */
export const __test__ = { escapeDrawtext, buildDrawtextFilter, runFfprobeDuration };
