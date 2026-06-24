/**
 * Talk2Me — Upload d'une photo CNI dans un dossier PRIVÉ (data/cni/), hors /uploads public.
 * PII : une carte d'identité ne doit JAMAIS être servie publiquement. On renvoie un id
 * opaque ; seul l'admin peut la consulter via /api/admin/cni/photo. Pascal 2026-06-22.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'data', 'cni');
const MAX_IMG = 8 * 1024 * 1024;   // 8 Mo photo
const MAX_VID = 40 * 1024 * 1024;  // 40 Mo vidéo liveness
const IMG_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const VID_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp' };

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad_form' }, { status: 400 }); }
  const file = form.get('file');
  const side = String(form.get('side') || '');
  if (!['front', 'back', 'video'].includes(side)) return NextResponse.json({ error: 'bad_side' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  const isVideo = side === 'video';
  if (file.size > (isVideo ? MAX_VID : MAX_IMG)) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  const ext = isVideo ? VID_EXT[file.type] : IMG_EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'bad_type' }, { status: 415 });

  try {
    mkdirSync(DIR, { recursive: true });
    const id = `${me.id}_${side}_${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    writeFileSync(path.join(DIR, id), buf, { mode: 0o600 });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: 'store_failed' }, { status: 500 });
  }
}
