/**
 * POST /api/users/me/ai-avatar
 * Talk2Me #324 v2 — Upload de la photo de l'IA personnelle de l'user courant.
 *
 * Body : multipart/form-data { file: <image> }
 * - max 5 Mo
 * - mime accepté : image/jpeg, image/png, image/webp
 * - sauvegardé dans /home/ubuntu/talktome/public/uploads/ai-avatars/{user_id}.{ext}
 * - update users.ai_avatar_url = "/uploads/ai-avatars/{user_id}.{ext}?v={ts}"
 *
 * DELETE /api/users/me/ai-avatar
 * Retire l'avatar de l'IA (ai_avatar_url = NULL) → fallback gradient + "T".
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] : chaque user peut customiser
 * la photo de profil de SA propre IA depuis le menu profil.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateAiAvatar } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_AVATAR_DIR = path.join(process.cwd(), 'public/uploads/ai-avatars');
const PUBLIC_PREFIX = '/uploads/ai-avatars';
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
    if (!existsSync(AI_AVATAR_DIR)) {
      await mkdir(AI_AVATAR_DIR, { recursive: true });
    }
    const ext = MIME_TO_EXT[mime];
    const filename = `${me.id}.${ext}`;
    const fullPath = path.join(AI_AVATAR_DIR, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buf);

    const url = `${PUBLIC_PREFIX}/${filename}?v=${Date.now()}`;
    updateAiAvatar(me.id, url);

    return NextResponse.json({ ok: true, ai_avatar_url: url });
  } catch (err) {
    console.error('[ai-avatar] POST error:', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  updateAiAvatar(me.id, null);
  return NextResponse.json({ ok: true, ai_avatar_url: null });
}
