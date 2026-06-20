'use server-only';

/**
 * Studio Vidéo IA — moteur de rendu (Pascal 2026-06-10).
 * Assemble un diaporama vidéo à partir de segments {caption, image?, voix?} :
 *   image (Ken Burns) ou fond couleur → sous-titre incrusté → concat →
 *   piste audio (voix off ElevenLabs placée par segment + musique de fond duckée)
 *   → MP4 H.264/AAC faststart au format choisi (9:16 / 1:1 / 16:9).
 * Self-contained (runner ffmpeg local) pour ne pas impacter le baking VideoCard.
 */

import { spawn } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const FFMPEG = 'ffmpeg';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FPS = 30;
const OUT_DIR = process.cwd() + '/public/uploads';
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

const DIMS: Record<string, [number, number]> = {
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '16:9': [1280, 720],
};

export type Ratio = '9:16' | '1:1' | '16:9';

export interface RenderSegment {
  caption: string;
  videoPath?: string | null; // chemin absolu clip vidéo de fond (prioritaire, « ça bouge »)
  imagePath?: string | null; // chemin absolu image locale (sinon fond couleur)
  voicePath?: string | null;  // chemin absolu mp3 voix off (sinon muet sur ce segment)
}

/** Styles de transition exposés → nom ffmpeg xfade. */
export const XFADE: Record<string, string> = {
  none: 'fade',
  fade: 'fade',
  dissolve: 'dissolve',
  slide: 'slideleft',
  wipe: 'wipeleft',
  circle: 'circleopen',
  zoom: 'zoomin',
  smooth: 'smoothleft',
};

export interface RenderInput {
  segments: RenderSegment[];
  transition?: string; // 'none' | 'fade' | 'dissolve' | 'slide' | 'wipe' | 'circle' | 'zoom' | 'smooth'
  ratio: Ratio;
  musicPath?: string | null; // chemin absolu musique de fond (sinon pas de musique)
  signal?: AbortSignal;      // annulation : si l'user ferme → on tue tout
}

function run(args: string[], label: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error(`ffmpeg ${label}: aborted`)); return; }
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, STEP_TIMEOUT_MS);
    const onAbort = () => { try { child.kill('SIGKILL'); } catch {} };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(to); signal?.removeEventListener('abort', onAbort); reject(new Error(`ffmpeg ${label}: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(to);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) { reject(new Error(`ffmpeg ${label}: aborted`)); return; }
      if (code !== 0) reject(new Error(`ffmpeg ${label} exit ${code}\n${stderr.split('\n').slice(-12).join('\n')}`));
      else resolve();
    });
  });
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let s = '';
    child.stderr.on('data', (d) => { s += d.toString(); });
    child.on('close', () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(0);
      resolve(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
    });
    child.on('error', () => resolve(0));
  });
}

function esc(s: string): string {
  // Apostrophe droite → typographique ’ : évite de casser le quoting drawtext
  // (text='...') sur les captions FR (« l'obstacle », « aujourd'hui »…).
  return (s || '')
    .replace(/\\/g, '\\\\').replace(/'/g, '’').replace(/:/g, '\\:')
    .replace(/,/g, '\\,').replace(/%/g, '\\%').replace(/\n/g, ' ');
}

/** Découpe une caption en lignes équilibrées (≤ maxLines, défaut 2). */
function wrap(caption: string, maxPerLine: number, maxLines = 2): string[] {
  const words = (caption || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxPerLine) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

/** drawtext pour un sous-titre (1–2 lignes), centré, bas de cadre, avec boîte. */
function captionFilter(caption: string, W: number, H: number): string {
  const fontsize = Math.round(W / 18);
  const maxChars = Math.floor((W * 0.86) / (fontsize * 0.62));
  const lines = wrap(caption, Math.max(10, maxChars), 2);
  if (!lines.length) return '';
  const lineH = Math.round(fontsize * 1.32);
  // bloc ancré à ~78% de la hauteur, lignes empilées
  const baseY = Math.round(H * 0.74);
  return lines.map((ln, i) => {
    const y = baseY + i * lineH;
    return [
      `drawtext=fontfile=${FONT}`,
      `text='${esc(ln)}'`,
      `x=(w-text_w)/2`, `y=${y}`,
      `fontsize=${fontsize}`, `fontcolor=white`,
      `borderw=2`, `bordercolor=black@0.9`,
      `box=1`, `boxcolor=black@0.42`, `boxborderw=16`,
    ].join(':');
  }).join(',');
}

/** Rend un segment en clip vidéo muet (image Ken Burns OU fond couleur). */
async function renderSegmentClip(seg: RenderSegment, dur: number, W: number, H: number, tmp: string, idx: number, signal?: AbortSignal): Promise<string> {
  const out = path.join(tmp, `clip${idx}.mp4`);
  const cap = captionFilter(seg.caption, W, H);
  if (seg.videoPath && existsSync(seg.videoPath)) {
    // CLIP VIDÉO qui bouge (façon InVideo) : recadré au format, voile + sous-titre.
    // Bouclé si le clip est plus court que la durée du segment (-stream_loop -1).
    const vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `setsar=1`,
      `fps=${FPS}`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.30:t=fill`,
      ...(cap ? [cap] : []),
    ].join(',');
    await run(
      ['-stream_loop', '-1', '-t', dur.toFixed(2), '-i', seg.videoPath, '-vf', vf,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-y', out],
      `clip${idx}-vid`, signal,
    );
  } else if (seg.imagePath && existsSync(seg.imagePath)) {
    // Image plein cadre, RAPIDE et fiable : scale-to-cover + crop + voile + sous-titre.
    // (zoompan/Ken Burns retiré : pathologiquement lent — 60s+/clip sur CPU, il
    //  faisait timeouter toute la génération. Le mouvement viendra de la vraie
    //  vidéo IA, pas d'un filtre qui fait fondre le serveur.)
    const vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `setsar=1`,
      `fps=${FPS}`,
      // voile sombre global → le sous-titre blanc reste lisible sur toute photo
      `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.30:t=fill`,
      ...(cap ? [cap] : []),
    ].join(',');
    await run(
      ['-loop', '1', '-t', dur.toFixed(2), '-i', seg.imagePath, '-vf', vf,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-y', out],
      `clip${idx}-img`, signal,
    );
  } else {
    // Fond sombre + caption centrée. Police mesurée pour TENIR dans 86% de la
    // largeur (marges latérales), jusqu'à 3 lignes → jamais de débordement.
    const usable = W * 0.86;
    const bigFont = Math.round(W / 16);
    const charW = bigFont * 0.62; // largeur moyenne DejaVu Bold
    const maxPerLine = Math.max(8, Math.floor(usable / charW));
    const lines = wrap(seg.caption, maxPerLine, 3);
    const lineH = Math.round(bigFont * 1.3);
    const baseY = `(h-${lines.length * lineH})/2`;
    const draw = lines.map((ln, i) =>
      [`drawtext=fontfile=${FONT}`, `text='${esc(ln)}'`, `x=(w-text_w)/2`,
        `y=${baseY}+${i * lineH}`, `fontsize=${bigFont}`, `fontcolor=white`,
        `borderw=2`, `bordercolor=black@0.6`].join(':')).join(',');
    const vf = `${draw || `drawbox=0:0:0:0`}`;
    await run(
      ['-f', 'lavfi', '-t', dur.toFixed(2), '-i', `color=c=0x12121a:s=${W}x${H}:r=${FPS}`,
        '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', '-y', out],
      `clip${idx}-bg`, signal,
    );
  }
  return out;
}

/**
 * Rend la vidéo finale. Retourne { url, posterUrl, durationSec }.
 */
export async function renderAiVideo(input: RenderInput): Promise<{ url: string; posterUrl: string; durationSec: number }> {
  const [W, H] = DIMS[input.ratio] || DIMS['9:16'];
  if (!input.segments.length) throw new Error('no_segments');
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const tmp = path.join(OUT_DIR, `aivid-${randomUUID()}`);
  await mkdir(tmp, { recursive: true });

  try {
    // 1) durée par segment (cale sur la voix si présente, sinon longueur caption)
    const durs: number[] = [];
    for (const seg of input.segments) {
      let d: number;
      if (seg.voicePath && existsSync(seg.voicePath)) {
        const vd = await probeDuration(seg.voicePath);
        d = Math.max(2.2, vd + 0.6);
      } else {
        const words = (seg.caption || '').split(/\s+/).filter(Boolean).length;
        d = Math.min(5, Math.max(2.6, words * 0.45 + 1.6));
      }
      durs.push(d);
    }
    const n = durs.length;

    // Transition entre plans (fondu enchaîné par défaut). Durée bornée pour ne
    // jamais dépasser un segment court.
    const wantTrans = input.transition !== 'none' && n >= 2;
    const minDur = Math.min(...durs);
    const T = wantTrans ? Math.max(0.2, Math.min(0.6, minDur * 0.35)) : 0;
    const xkind = XFADE[input.transition || 'fade'] || 'fade';

    // Démarrages (la voix se cale sur le moment où le plan apparaît). Avec
    // transitions, les plans se chevauchent de T → le timeline se raccourcit.
    const starts: number[] = [];
    for (let i = 0; i < n; i++) {
      starts.push(i === 0 ? 0 : starts[i - 1] + durs[i - 1] - T);
    }
    const total = starts[n - 1] + durs[n - 1];

    // 2) clips muets — rendus EN PARALLÈLE (cap 3 pour ne pas saturer le CPU)
    const clips: string[] = new Array(n);
    const LIMIT = 3;
    for (let start = 0; start < n; start += LIMIT) {
      const batch = [];
      for (let i = start; i < Math.min(start + LIMIT, n); i++) {
        batch.push(renderSegmentClip(input.segments[i], durs[i], W, H, tmp, i, input.signal).then((c) => { clips[i] = c; }));
      }
      await Promise.all(batch);
    }

    // 3) assemblage vidéo : xfade (transitions) si ≥2 plans, sinon concat simple
    const silent = path.join(tmp, 'silent.mp4');
    if (wantTrans) {
      const inputs: string[] = [];
      clips.forEach((c) => { inputs.push('-i', c); });
      const fc: string[] = [];
      let cur = '[0:v]';
      let off = durs[0] - T;
      for (let k = 1; k < n; k++) {
        const outLbl = k === n - 1 ? '[vout]' : `[v${k}]`;
        fc.push(`${cur}[${k}:v]xfade=transition=${xkind}:duration=${T.toFixed(3)}:offset=${off.toFixed(3)}${outLbl}`);
        cur = outLbl;
        off += durs[k] - T;
      }
      await run(
        [...inputs, '-filter_complex', fc.join(';'), '-map', '[vout]',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-y', silent],
        'xfade', input.signal,
      );
    } else {
      const listFile = path.join(tmp, 'list.txt');
      await writeFile(listFile, clips.map((c) => `file '${c}'`).join('\n'));
      await run(
        ['-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-preset', 'veryfast',
          '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-y', silent],
        'concat', input.signal,
      );
    }

    // 4) piste audio : voix placées par segment + musique duckée
    const audio = path.join(tmp, 'audio.m4a');
    const voiceIdx: { i: number; file: string; startMs: number }[] = [];
    input.segments.forEach((seg, i) => {
      if (seg.voicePath && existsSync(seg.voicePath)) voiceIdx.push({ i, file: seg.voicePath, startMs: Math.round(starts[i] * 1000) });
    });
    const hasMusic = !!(input.musicPath && existsSync(input.musicPath));
    let hasAudio = true;
    if (voiceIdx.length) {
      const inputs: string[] = [];
      voiceIdx.forEach((v) => { inputs.push('-i', v.file); });
      let musInputIdx = -1;
      if (hasMusic) { inputs.push('-stream_loop', '-1', '-i', input.musicPath!); musInputIdx = voiceIdx.length; }
      const fc: string[] = [];
      const mixLabels: string[] = [];
      voiceIdx.forEach((v, k) => { fc.push(`[${k}:a]adelay=${v.startMs}|${v.startMs}[a${k}]`); mixLabels.push(`[a${k}]`); });
      if (hasMusic) { fc.push(`[${musInputIdx}:a]volume=0.16[mus]`); mixLabels.push('[mus]'); }
      fc.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[mx]`);
      fc.push(`[mx]atrim=0:${total.toFixed(2)}[a]`);
      await run([...inputs, '-filter_complex', fc.join(';'), '-map', '[a]', '-t', total.toFixed(2),
        '-c:a', 'aac', '-b:a', '160k', '-y', audio], 'audio-mix', input.signal);
    } else if (hasMusic) {
      await run(['-stream_loop', '-1', '-i', input.musicPath!, '-af', 'volume=0.5', '-t', total.toFixed(2),
        '-c:a', 'aac', '-b:a', '160k', '-y', audio], 'audio-music', input.signal);
    } else {
      hasAudio = false;
    }

    // 5) mux final
    const name = `aivideo-${randomUUID()}.mp4`;
    const finalOut = path.join(OUT_DIR, name);
    if (hasAudio) {
      await run(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', '-y', finalOut], 'mux', input.signal);
    } else {
      await run(['-i', silent, '-c:v', 'copy', '-movflags', '+faststart', '-y', finalOut], 'mux-silent', input.signal);
    }

    // 6) poster (1ʳᵉ frame)
    const posterName = `aivideo-${randomUUID()}.jpg`;
    const posterOut = path.join(OUT_DIR, posterName);
    await run(['-i', finalOut, '-vframes', '1', '-q:v', '3', '-y', posterOut], 'poster', input.signal);

    return { url: `/uploads/${name}`, posterUrl: `/uploads/${posterName}`, durationSec: Math.round(total) };
  } finally {
    rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
