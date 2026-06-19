// app/uploads/[...path]/route.ts
// Sert dynamiquement les fichiers uploadés sous public/uploads/, Y COMPRIS les
// SOUS-DOSSIERS (aivid-img/, avatar-videos/, cutouts/…). Next.js fige /public au
// build et ne sert pas les fichiers ajoutés au runtime ; ce handler les sert.
// Bug Pascal 2026-06-18 : l'ancien handler [filename] (1 seul segment) rejetait
// les sous-dossiers → toutes les images de scène du composer en 404 (vignettes cassées).
import { NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');

const EXT_TO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await ctx.params;
    if (!Array.isArray(segments) || segments.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }
    // Anti-traversée : aucun segment vide / ".." / caractère douteux.
    for (const seg of segments) {
      if (!seg || seg === '..' || seg === '.' || !/^[A-Za-z0-9._-]+$/.test(seg)) {
        return new NextResponse('Bad path', { status: 400 });
      }
    }
    const full = path.resolve(UPLOAD_DIR, ...segments);
    // Garde absolue : le chemin résolu DOIT rester sous UPLOAD_DIR.
    if (full !== UPLOAD_DIR && !full.startsWith(UPLOAD_DIR + path.sep)) {
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
    const ext = path.extname(full).toLowerCase();
    const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    const buf = await readFile(full);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(stats.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    console.error('[uploads] GET error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
