import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateAiAvatarVideo } from '@/lib/db';
import { hunyuanCustomVideo } from '@/lib/ai-video/hunyuan-custom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * Talk2Me — Studio créatif (Pascal 2026-06-18) : photo → VIDÉO photoréaliste de l'avatar IA.
 * 100% chez nous (ComfyUI + HunyuanVideo I2V via tunnel). Moteur partagé : lib/ai-video/hunyuan-i2v.
 * Servie via /api/avatar/video/<id> (lue en root → jamais 404 après `next start`).
 */
const OUT_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatar-videos');

export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b64 = '', prompt = '';
  try {
    const body = await request.json();
    b64 = String(body?.image_b64 || '').replace(/^data:[^,]*,/, '').trim();
    prompt = String(body?.prompt || '').trim();
  } catch { /* */ }
  if (!b64) return NextResponse.json({ error: 'no_image' }, { status: 400 });
  if (!prompt) prompt = 'a person looking at the camera, subtle natural head movement, blinking, breathing, photorealistic portrait, sharp focus, high detail, cinematic lighting';

  let imgBuf: Buffer;
  try { imgBuf = Buffer.from(b64, 'base64'); } catch { return NextResponse.json({ error: 'bad_image' }, { status: 400 }); }
  if (imgBuf.length < 256 || imgBuf.length > 25 * 1024 * 1024) return NextResponse.json({ error: 'bad_image' }, { status: 400 });

  const r = await hunyuanCustomVideo({ imageBuf: imgBuf, prompt, outDir: OUT_DIR, outName: `avatar-${user.id}` });
  if (!r.ok) {
    const code = r.error === 'gpu_unavailable' ? 503 : r.error === 'timeout' ? 504 : 502;
    return NextResponse.json({ error: r.error || 'failed' }, { status: code });
  }
  const url = `/api/avatar/video/${user.id}?v=${Date.now()}`;
  updateAiAvatarVideo(user.id, url);
  return NextResponse.json({ ok: true, url });
}
