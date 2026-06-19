import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Talk2Me — Studio créatif (Pascal 2026-06-18) : streame la vidéo avatar IA depuis le disque.
 * Sert via une ROUTE (lue en root) et NON via /public, car `next start` fige la liste des
 * fichiers public/ au démarrage → un fichier généré au runtime renverrait 404 jusqu'au prochain
 * restart. Ici on lit le fichier à chaque requête : toujours frais, pas de restart.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return new NextResponse('not found', { status: 404 });

  const file = path.join(process.cwd(), 'public', 'uploads', 'avatar-videos', `avatar-${safe}.mp4`);
  try {
    const st = await stat(file);
    const buf = await readFile(file);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(st.size),
        'Cache-Control': 'public, max-age=300',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
