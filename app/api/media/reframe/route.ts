/**
 * Talk2Me — multi-canal : REFRAME vidéo au ratio d'un réseau (serveur ffmpeg).
 * POST { media_url: '/uploads/xxx.mp4', ratio: '1:1'|'9:16'|'16:9' } → { url }.
 * Sécurité : media_url doit être sous /uploads/ (pas de chemin arbitraire).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { existsSync } from 'fs';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { reframeVideo } from '@/lib/ffmpeg-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPLOAD_DIR = '/home/ubuntu/talktome/public/uploads';
const RATIOS = ['1:1', '9:16', '16:9'];

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { media_url?: string; ratio?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const ratio = b.ratio || '';
  if (!RATIOS.includes(ratio)) return NextResponse.json({ error: 'bad_ratio' }, { status: 400 });
  // Le media doit être un upload à nous : /uploads/<fichier> sans traversal.
  const m = (b.media_url || '').match(/^\/uploads\/([A-Za-z0-9._-]+\.(mp4|webm|mov|m4v))$/i);
  if (!m) return NextResponse.json({ error: 'bad_media_url' }, { status: 400 });
  const inputPath = `${UPLOAD_DIR}/${m[1]}`;
  if (!existsSync(inputPath)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const r = await reframeVideo(inputPath, ratio as '1:1' | '9:16' | '16:9');
    return NextResponse.json({ ok: true, url: r.url });
  } catch (e) {
    return NextResponse.json({ error: 'reframe_failed', detail: (e as Error)?.message?.slice(0, 200) }, { status: 500 });
  }
}
