/**
 * Talk2Me — GET /api/anim/file?name=<fichier> (Pascal 2026-06-14).
 * Sert un fichier d'animation depuis /uploads en conservant son NOM D'ORIGINE
 * (espaces, accents…) — Next static refuse les noms à espaces. Lecture seule,
 * bornée à /uploads, extensions d'anim uniquement.
 */
import type { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOADS = '/home/ubuntu/talktome/public/uploads';
const OK_EXT = ['.fbx', '.glb', '.vrma', '.gltf'];

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name') || '';
  const base = path.basename(name); // anti-traversal
  if (base !== name || !OK_EXT.includes(path.extname(base).toLowerCase())) {
    return new Response('bad name', { status: 400 });
  }
  try {
    const buf = await readFile(path.join(UPLOADS, base));
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
