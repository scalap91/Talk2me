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
  '.m4v': 'video/mp4',
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
  // Audio conteneur MP4/AAC (.m4a) : le composer album stocke souvent en .m4a.
  // Bug Pascal 2026-09-07 : absent de la table → servi en octet-stream → muet sur web
  // (le natif se fie à l'extension, d'où « ça joue en natif, pas en web »).
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.json': 'application/json',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const req = _req;
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
    const size = stats.size;
    const buf = await readFile(full);

    // Requêtes Range (bytes=start-end) : Safari/iOS exigent un 206 pour lire un
    // média (audio/vidéo) et pour permettre le seek. Sans ça, le lecteur reste muet
    // même avec le bon type MIME. On répond partiellement quand un Range est demandé.
    const range = req.headers.get('range');
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (m && (m[1] !== '' || m[2] !== '')) {
      let start = m[1] === '' ? 0 : parseInt(m[1], 10);
      let end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
      // Forme « bytes=-N » = les N derniers octets.
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
        });
      }
      end = Math.min(end, size - 1);
      const chunk = buf.subarray(start, end + 1);
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    console.error('[uploads] GET error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
