/**
 * POST /api/users/me/avatar
 * Upload de la photo de profil de l'user courant.
 *
 * Body : multipart/form-data { file: <image> }
 * - max 5 Mo
 * - mime accepté : image/jpeg, image/png, image/webp
 * - sauvegardé dans /home/ubuntu/talktome/public/uploads/avatars/{user_id}.{ext}
 * - update users.avatar_url = "/uploads/avatars/{user_id}.{ext}?v={ts}"
 *   (le `?v=` casse les caches navigateur entre 2 uploads successifs)
 *
 * DELETE /api/users/me/avatar
 * Retire l'avatar (avatar_url = NULL). On ne supprime pas physiquement le
 * fichier (cheap).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateUserAvatar } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AVATAR_DIR = '/home/ubuntu/talktome/public/uploads/avatars';
const PUBLIC_PREFIX = '/uploads/avatars';
const MAX_AVATAR = 5 * 1024 * 1024; // 5 Mo

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  const mime = file.type;
  if (!MIME_TO_EXT[mime]) {
    return NextResponse.json({ error: 'unsupported_mime', mime }, { status: 415 });
  }
  if (file.size > MAX_AVATAR) {
    return NextResponse.json(
      { error: 'file_too_large', size: file.size, max: MAX_AVATAR, max_mb: 5 },
      { status: 413 }
    );
  }

  try {
    if (!existsSync(AVATAR_DIR)) {
      await mkdir(AVATAR_DIR, { recursive: true });
    }
    const ext = MIME_TO_EXT[mime];
    const filename = `${me.id}.${ext}`;
    const fullPath = path.join(AVATAR_DIR, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buf);

    // Query string ?v=timestamp pour casser les caches navigateur entre
    // 2 uploads successifs du même user (même filename).
    const url = `${PUBLIC_PREFIX}/${filename}?v=${Date.now()}`;
    updateUserAvatar(me.id, url);

    return NextResponse.json({ ok: true, avatar_url: url });
  } catch (err) {
    console.error('[avatar] POST error:', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  updateUserAvatar(me.id, null);
  return NextResponse.json({ ok: true, avatar_url: null });
}
