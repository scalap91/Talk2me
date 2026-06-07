// /home/ubuntu/talktome/app/uploads/[filename]/route.ts
// Sert dynamiquement les fichiers uploadés (public/uploads/) car Next.js fige
// le contenu de /public au build et n'ingère pas les fichiers ajoutés après.
import { NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = '/home/ubuntu/talktome/public/uploads';

const EXT_TO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await ctx.params;
    // Garde anti-traversée
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      return new NextResponse('Bad filename', { status: 400 });
    }
    const full = path.join(UPLOAD_DIR, filename);
    if (path.dirname(full) !== UPLOAD_DIR) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    let stats;
    try {
      stats = await stat(full);
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }
    if (!stats.isFile()) {
      return new NextResponse('Not found', { status: 404 });
    }
    const ext = path.extname(filename).toLowerCase();
    const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    const buf = await readFile(full);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(stats.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('[uploads] GET error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
