// /home/ubuntu/talktome/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = '/home/ubuntu/talktome/public/uploads';
const PUBLIC_PREFIX = '/uploads';

// Talk2Me média (Pascal 2026-06-04) — limites par kind.
// Master direct (mission media chat) : image 10 Mo / audio 20 Mo / vidéo 50 Mo.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_AUDIO = 20 * 1024 * 1024;
// Talk2Me #422 (Pascal 2026-06-06) — 50 Mo bloquait quasi toutes les vidéos de
// téléphone (file_too_large → la vidéo n'apparaissait pas dans l'éditeur).
// Relevé à 200 Mo, aligné avec le client + nginx (client_max_body_size 500M).
const MAX_VIDEO = 200 * 1024 * 1024;

const ALLOWED_VIDEO = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);
const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
]);

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

function safeExtFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const m = name.match(/\.([a-zA-Z0-9]{1,6})$/);
  return m ? m[1].toLowerCase() : null;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    const mime = (file.type || '').toLowerCase();
    const size = file.size;

    let kind: 'video' | 'image' | 'audio' | null = null;
    if (ALLOWED_VIDEO.has(mime)) kind = 'video';
    else if (ALLOWED_IMAGE.has(mime)) kind = 'image';
    else if (ALLOWED_AUDIO.has(mime)) kind = 'audio';

    if (!kind) {
      return NextResponse.json(
        { error: 'unsupported_mime', mime },
        { status: 415 }
      );
    }

    const max =
      kind === 'video' ? MAX_VIDEO : kind === 'audio' ? MAX_AUDIO : MAX_IMAGE;
    if (size > max) {
      return NextResponse.json(
        {
          error: 'file_too_large',
          size,
          max,
          max_mb: max / 1024 / 1024,
          kind,
        },
        { status: 413 }
      );
    }

    const ext = MIME_TO_EXT[mime] ?? safeExtFromName(file.name) ?? 'bin';
    const id = randomUUID();
    const filename = `${id}.${ext}`;

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const fullPath = path.join(UPLOAD_DIR, filename);
    await writeFile(fullPath, buf);

    const url = `${PUBLIC_PREFIX}/${filename}`;
    return NextResponse.json({
      url,
      size,
      mime,
      kind,
      original_filename: typeof file.name === 'string' ? file.name : null,
    });
  } catch (err) {
    console.error('[upload] POST error:', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
