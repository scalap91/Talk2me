/**
 * /api/cards/editor/add-audio — mix audio sur vidéo (preview ou bake).
 *
 * Talk2Me #420.
 *
 * Use case principal : générer un MP4 temp avec la musique mixée pour
 * que l'user puisse "Preview" avant Apply final. Le bake final passe par
 * /apply-video-ops (qui orchestre trim+texts+audio dans le même run).
 *
 * POST {
 *   video_path: '/uploads/xxx.mp4',
 *   audio_source: 'lib' | 'upload',
 *   audio_id?: string,    // si lib
 *   audio_path?: string,  // si upload (/uploads/yyy.mp3) OU audio_id pour lib
 *   audio_url?: string,   // alternative : URL absolue (/audio-lib/... ou /uploads/...)
 *   video_volume: 0–100,
 *   audio_volume: 0–100,
 *   audio_offset_sec: number
 * }
 *  → { ok, preview_url, duration_s }
 *
 * Sécurité :
 *  - Auth obligatoire
 *  - video_path doit commencer par /uploads/
 *  - audio_url résolu via lib/audio-lib-resolver (anti-traversal + whitelist)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { stat } from 'fs/promises';
import { randomUUID } from 'crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { mixAudioOnVideo } from '@/lib/ffmpeg-helpers';
import { resolveAudioSourcePath } from '@/lib/audio-lib-resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPLOAD_DIR = '/home/ubuntu/talktome/public/uploads';
const PUBLIC_PREFIX = '/uploads';
const AUDIO_LIB_INDEX = '/home/ubuntu/talktome/public/audio-lib/index.json';
const MAX_SAFE_FILE_BYTES = 500 * 1024 * 1024;

type LibEntry = {
  id: string;
  name: string;
  category: string;
  file: string;
  duration_sec: number;
  source: string;
  license: string;
};

function loadLibIndex(): LibEntry[] {
  try {
    const raw = readFileSync(AUDIO_LIB_INDEX, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findLibTrack(id: string): LibEntry | null {
  const idx = loadLibIndex();
  return idx.find((t) => t.id === id) || null;
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

    const videoUrl =
      typeof body?.video_path === 'string' ? body.video_path.trim() : '';
    if (!videoUrl.startsWith('/uploads/')) {
      return NextResponse.json({ error: 'invalid_video_path' }, { status: 400 });
    }
    const videoFilename = path.basename(videoUrl.slice('/uploads/'.length));
    if (
      !videoFilename ||
      videoFilename.startsWith('.') ||
      !/\.(mp4|webm|mov)$/i.test(videoFilename)
    ) {
      return NextResponse.json({ error: 'invalid_video_filename' }, { status: 400 });
    }
    const videoSourcePath = path.join(UPLOAD_DIR, videoFilename);
    if (!existsSync(videoSourcePath)) {
      return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
    }
    const st = await stat(videoSourcePath);
    if (st.size > MAX_SAFE_FILE_BYTES) {
      return NextResponse.json(
        { error: 'file_too_large', size: st.size },
        { status: 413 }
      );
    }

    // Résoud l'URL audio à partir des différentes formes acceptées :
    // - audio_url explicite
    // - audio_source='lib' + audio_id → on regarde index.json
    // - audio_source='upload' + audio_path
    let audioUrl = '';
    if (typeof body?.audio_url === 'string' && body.audio_url.trim()) {
      audioUrl = body.audio_url.trim();
    } else if (body?.audio_source === 'lib' && typeof body?.audio_id === 'string') {
      const track = findLibTrack(body.audio_id);
      if (!track) {
        return NextResponse.json({ error: 'lib_track_not_found' }, { status: 404 });
      }
      audioUrl = track.file;
    } else if (
      body?.audio_source === 'upload' &&
      typeof body?.audio_path === 'string'
    ) {
      audioUrl = body.audio_path.trim();
    }

    if (!audioUrl) {
      return NextResponse.json({ error: 'missing_audio' }, { status: 400 });
    }

    const audioPath = resolveAudioSourcePath(audioUrl);
    if (!audioPath) {
      return NextResponse.json(
        { error: 'invalid_audio_url', audio_url: audioUrl },
        { status: 400 }
      );
    }

    const videoVolume =
      typeof body?.video_volume === 'number'
        ? Math.max(0, Math.min(100, body.video_volume))
        : 80;
    const audioVolume =
      typeof body?.audio_volume === 'number'
        ? Math.max(0, Math.min(100, body.audio_volume))
        : 60;
    const audioOffsetSec =
      typeof body?.audio_offset_sec === 'number'
        ? Math.max(0, body.audio_offset_sec)
        : 0;

    // Génère fichier temp pour preview. Pas de cleanup auto — Pascal pourra
    // ajouter une tâche cron de purge des `.preview_*.mp4` plus tard.
    const previewName = `preview_${randomUUID()}.mp4`;
    const previewPath = path.join(UPLOAD_DIR, previewName);

    await mixAudioOnVideo(videoSourcePath, previewPath, {
      audioPath,
      videoVolume,
      audioVolume,
      audioOffsetSec,
    });

    return NextResponse.json({
      ok: true,
      preview_url: `${PUBLIC_PREFIX}/${previewName}`,
    });
  } catch (err: any) {
    console.error('[add-audio] error', err);
    return NextResponse.json(
      { ok: false, error: 'ffmpeg_failed', detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
