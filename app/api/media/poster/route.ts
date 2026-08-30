/**
 * Vignette vidéo auto (Pascal 2026-08-30) — pour les vidéos perso (.mp4/.webm/.mov) sans poster,
 * on extrait la 1ʳᵉ image via ffmpeg, on la met en CACHE sur disque, et on redirige vers le fichier
 * statique (servi par nginx, cache immuable). Utilisé par le lecteur Discovery (deriveCover). Idempotent :
 * la génération n'a lieu qu'une fois par source. GET /api/media/poster?src=/uploads/xxx.mp4
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC = path.join(process.cwd(), 'public');
const POSTER_DIR = path.join(PUBLIC, 'uploads', '_posters');
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;

function run(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err) => resolve(!err));
  });
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src') || '';
  // Sécurité : uniquement un chemin /uploads/… sans remontée.
  if (!src.startsWith('/uploads/') || src.includes('..') || !VIDEO_RE.test(src)) {
    return NextResponse.json({ error: 'bad_src' }, { status: 400 });
  }
  const input = path.join(PUBLIC, src);
  if (!existsSync(input)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 20);
  const outAbs = path.join(POSTER_DIR, `${hash}.jpg`);

  async function serve(): Promise<NextResponse> {
    // On SERT le jpg directement (pas de redirect : req.url interne = 127.0.0.1:3010, injoignable
    // par le navigateur derrière nginx). Même origine, cache long, immuable.
    const buf = await readFile(outAbs);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  if (existsSync(outAbs)) return serve();

  try { await mkdir(POSTER_DIR, { recursive: true }); } catch { /* */ }

  // -ss avant -i = seek rapide ; on tente 1s (évite le fondu noir d'ouverture), sinon 0s.
  const base = ['-y', '-loglevel', 'error', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4'];
  let ok = await run('ffmpeg', ['-ss', '1', '-i', input, ...base, outAbs], 12000);
  if (!ok || !existsSync(outAbs)) ok = await run('ffmpeg', ['-i', input, ...base, outAbs], 12000);

  if (ok && existsSync(outAbs)) return serve();
  return NextResponse.json({ error: 'poster_failed' }, { status: 404 });
}
