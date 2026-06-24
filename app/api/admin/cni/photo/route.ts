/**
 * Talk2Me — Super-Admin : sert une photo CNI depuis le dossier PRIVÉ data/cni/.
 * GET ?user_id=&side=front|back → image (admin only). Jamais accessible publiquement.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getCniPhotoId } from '@/lib/transport-profile';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'data', 'cni');
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', '3gp': 'video/3gpp' };

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const userId = req.nextUrl.searchParams.get('user_id') || '';
  const side = req.nextUrl.searchParams.get('side');
  if (side !== 'front' && side !== 'back' && side !== 'video') return NextResponse.json({ error: 'bad_side' }, { status: 400 });

  const id = getCniPhotoId(userId, side);
  if (!id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Anti-traversal : l'id est un nom de fichier simple.
  if (id.includes('/') || id.includes('..')) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const file = path.join(DIR, id);
  if (!existsSync(file)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const ext = id.split('.').pop() || '';
  const buf = readFileSync(file);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, no-store' },
  });
}
