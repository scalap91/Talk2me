/**
 * /api/cards/editor/apply-video-ops — baking ffmpeg serveur.
 *
 * Doctrine [[talk2me-card-editor-ia]] Phase B :
 *  - Pendant l'édition : preview CSS, pas de baking.
 *  - Au "Publier" : on POST ici avec source_url + ops → ffmpeg produit la
 *    vidéo finale et la cover JPG → on renvoie les URLs publiques.
 *
 * POST {
 *   source_url: '/uploads/xxx.mp4',
 *   ops: {
 *     trim?: { start_s, end_s },
 *     cover_time_s?: number,        // dans la vidéo FINALE (post-trim)
 *     texts?: [{ content, position, start_s?, end_s? }]
 *   }
 * }
 *  → { ok, final_video_url, cover_url, duration_s, steps }
 *
 * Sécurité :
 *  - Auth cookie obligatoire
 *  - source_url doit commencer par /uploads/ → résolution dans
 *    /home/ubuntu/talktome/public/uploads/ (pas de path traversal)
 *  - Pas de spawn sans validation
 *  - Sync MVP : l'user attend (UI affiche loader). V2 = queue.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  applyVideoOps,
  type VideoTextOp,
  type VideoAudioOp,
  type ConcatClipInput,
  type ConcatTransitionInput,
} from '@/lib/ffmpeg-helpers';
import { resolveAudioSourcePath } from '@/lib/audio-lib-resolver';
import { FILTER_PRESETS, type FilterPreset } from '@/lib/video-filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sync baking peut prendre jusqu'à 5 min/étape. On laisse Next gérer son
// propre timeout par défaut (la fonction retournera quand ffmpeg termine).
export const maxDuration = 300;

const UPLOAD_DIR = process.cwd() + '/public/uploads';
const PUBLIC_PREFIX = '/uploads';
const MAX_SAFE_FILE_BYTES = 500 * 1024 * 1024; // garde-fou : 500 Mo

function safeNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return v;
}

/**
 * Talk2Me #421 — résout une URL /uploads/<basename> en chemin absolu sûr.
 * Anti path-traversal : on garde uniquement le basename.
 */
function resolveUploadedClipPath(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u.startsWith('/uploads/')) return null;
  const filename = path.basename(u.slice('/uploads/'.length));
  if (!filename || filename.startsWith('.') || !/\.(mp4|webm|mov|m4v)$/i.test(filename)) {
    return null;
  }
  const abs = path.join(UPLOAD_DIR, filename);
  if (!existsSync(abs)) return null;
  return abs;
}

function isValidFilter(v: unknown): FilterPreset | null {
  if (typeof v !== 'string') return null;
  return v in FILTER_PRESETS ? (v as FilterPreset) : null;
}

/**
 * Parse l'array clips du body. Retourne null si invalide (caller fallback
 * sur le mode legacy 1-clip).
 */
function parseClips(
  raw: unknown
): { clips: ConcatClipInput[]; errors: string[] } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ConcatClipInput[] = [];
  const errors: string[] = [];
  for (let i = 0; i < raw.slice(0, 20).length; i++) {
    const c = raw[i];
    if (!c || typeof c !== 'object') {
      errors.push(`clip[${i}]: not an object`);
      continue;
    }
    const cc = c as Record<string, unknown>;
    const sourcePath = resolveUploadedClipPath(cc.source_url);
    if (!sourcePath) {
      errors.push(`clip[${i}]: invalid source_url`);
      continue;
    }
    const trimStart = safeNumber(cc.trim_start_sec);
    const trimEnd = safeNumber(cc.trim_end_sec);
    const dur = safeNumber(cc.duration_original_sec);
    const start = trimStart !== null && trimStart >= 0 ? trimStart : 0;
    const end =
      trimEnd !== null && trimEnd > start
        ? trimEnd
        : dur !== null && dur > start
        ? dur
        : start + 1;
    out.push({
      sourcePath,
      trimStartSec: start,
      trimEndSec: end,
      filter: isValidFilter(cc.filter),
    });
  }
  if (out.length === 0) return null;
  return { clips: out, errors };
}

function parseTransitions(
  raw: unknown,
  expectedLen: number
): ConcatTransitionInput[] {
  const out: ConcatTransitionInput[] = [];
  if (Array.isArray(raw)) {
    for (const t of raw.slice(0, expectedLen)) {
      if (!t || typeof t !== 'object') {
        out.push({ type: 'cut', durationMs: 0 });
        continue;
      }
      const tt = t as Record<string, unknown>;
      const type = tt.type === 'fade' ? 'fade' : 'cut';
      const dur = safeNumber(tt.duration_ms) ?? 0;
      out.push({
        type,
        durationMs: type === 'fade' ? Math.max(100, Math.min(2000, dur || 300)) : 0,
      });
    }
  }
  // Pad si manquant
  while (out.length < expectedLen) {
    out.push({ type: 'cut', durationMs: 0 });
  }
  return out;
}

function parseTexts(raw: unknown): VideoTextOp[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoTextOp[] = [];
  for (const t of raw.slice(0, 6)) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const content = typeof o.content === 'string' ? o.content.slice(0, 80).trim() : '';
    if (!content) continue;
    const position =
      o.position === 'top' || o.position === 'bottom' || o.position === 'center'
        ? (o.position as 'top' | 'bottom' | 'center')
        : 'center';
    const start_s = safeNumber(o.start_s);
    const end_s = safeNumber(o.end_s);
    out.push({ content, position, start_s, end_s });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const me = getCurrentUserFromRequest(request);
    if (!me) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const ops = body?.ops && typeof body.ops === 'object' ? body.ops : {};

    // Talk2Me #421 — parse clips multi en priorité
    const parsedClips = parseClips(ops.clips);

    let sourcePath: string;
    if (parsedClips) {
      // Mode multi-clips : on prend le 1er clip comme "source" symbolique
      // (utilisé pour cover si jamais legacy). Le concat se fait dans
      // applyVideoOps via multiClips.
      sourcePath = parsedClips.clips[0].sourcePath;
    } else {
      // Legacy 1-clip
      const sourceUrl =
        typeof body?.source_url === 'string' ? body.source_url.trim() : '';
      if (!sourceUrl.startsWith('/uploads/')) {
        return NextResponse.json({ error: 'invalid_source_url' }, { status: 400 });
      }
      const filename = path.basename(sourceUrl.slice('/uploads/'.length));
      if (!filename || filename.startsWith('.') || !/\.(mp4|webm|mov|m4v)$/i.test(filename)) {
        return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });
      }
      sourcePath = path.join(UPLOAD_DIR, filename);
      if (!existsSync(sourcePath)) {
        return NextResponse.json({ error: 'source_not_found' }, { status: 404 });
      }
      // Garde-fou taille (uniquement en legacy : multi-clips a déjà validé chaque clip)
      const st = await stat(sourcePath);
      if (st.size > MAX_SAFE_FILE_BYTES) {
        return NextResponse.json(
          { error: 'file_too_large', size: st.size },
          { status: 413 }
        );
      }
    }

    let trim: { start_s: number; end_s: number } | null = null;
    if (!parsedClips && ops.trim && typeof ops.trim === 'object') {
      const s = safeNumber((ops.trim as any).start_s);
      const e = safeNumber((ops.trim as any).end_s);
      if (s !== null && e !== null && e > s) {
        trim = { start_s: Math.max(0, s), end_s: e };
      }
    }
    const cover_time_s = safeNumber(ops.cover_time_s) ?? null;
    const texts = parseTexts(ops.texts);
    const transitions = parsedClips
      ? parseTransitions(ops.transitions, Math.max(0, parsedClips.clips.length - 1))
      : [];

    // Talk2Me #420 — bande son
    let audioOp: VideoAudioOp | null = null;
    if (ops.audio && typeof ops.audio === 'object') {
      const a = ops.audio as Record<string, unknown>;
      const audioUrl = typeof a.audio_url === 'string' ? a.audio_url : '';
      if (audioUrl) {
        const resolved = resolveAudioSourcePath(audioUrl);
        if (!resolved) {
          return NextResponse.json(
            { error: 'invalid_audio_url', audio_url: audioUrl },
            { status: 400 }
          );
        }
        const videoVol =
          typeof a.video_volume === 'number' ? Math.max(0, Math.min(100, a.video_volume)) : 80;
        const audioVol =
          typeof a.audio_volume === 'number' ? Math.max(0, Math.min(100, a.audio_volume)) : 60;
        const audioOffset =
          typeof a.audio_offset_sec === 'number' ? Math.max(0, a.audio_offset_sec) : 0;
        audioOp = {
          audioPath: resolved,
          videoVolume: videoVol,
          audioVolume: audioVol,
          audioOffsetSec: audioOffset,
        };
      }
    }

    const result = await applyVideoOps({
      sourcePath,
      outDir: UPLOAD_DIR,
      publicPrefix: PUBLIC_PREFIX,
      trim,
      coverTimeS: cover_time_s,
      texts,
      audio: audioOp,
      multiClips: parsedClips
        ? { clips: parsedClips.clips, transitions }
        : null,
    });

    return NextResponse.json({
      ok: true,
      final_video_url: result.finalVideoUrl,
      cover_url: result.coverUrl,
      duration_s: result.durationS,
      steps: result.steps,
    });
  } catch (err: any) {
    console.error('[apply-video-ops] error', err);
    return NextResponse.json(
      { ok: false, error: 'ffmpeg_failed', detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
