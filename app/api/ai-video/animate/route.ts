import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hunyuanCustomVideo } from '@/lib/ai-video/hunyuan-custom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * Talk2Me — Studio créatif (Pascal 2026-06-18) : ANIME une image fixe en vidéo.
 * Cœur de la synergie : le composer produit une image fixe par scène (script → SDXL) →
 * cette route la « met en vie » via NOTRE GPU (HunyuanVideo I2V). Entrée = image de scène
 * (image_url sous /uploads/...) OU image collée (image_b64), + un prompt d'animation.
 * Sortie servie via /api/ai-video/clip/<name> (lue en root → pas de 404 `next start`).
 */
const OUT_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatar-videos');

async function loadImage(imageUrl: string, imageB64: string): Promise<Buffer | null> {
  if (imageB64) { try { return Buffer.from(imageB64.replace(/^data:[^,]*,/, ''), 'base64'); } catch { return null; } }
  if (imageUrl) {
    // image servie chez nous (/uploads/...) → lecture disque ; sinon fetch http
    if (imageUrl.startsWith('/uploads/')) {
      const clean = imageUrl.split('?')[0].replace(/\.\./g, '');
      try { return await readFile(path.join(process.cwd(), 'public', clean)); } catch { return null; }
    }
    if (/^https?:\/\//i.test(imageUrl)) {
      try { const r = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* */ }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let imageUrl = '', imageB64 = '', prompt = '';
  try {
    const b = await request.json();
    imageUrl = String(b?.image_url || '').trim();
    imageB64 = String(b?.image_b64 || '').trim();
    prompt = String(b?.prompt || '').trim();
  } catch { /* */ }

  const imgBuf = await loadImage(imageUrl, imageB64);
  if (!imgBuf || imgBuf.length < 256) return NextResponse.json({ error: 'no_image' }, { status: 400 });
  if (!prompt) prompt = 'subtle natural motion, cinematic, photorealistic, sharp focus';

  const name = `anim-${user.id.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const r = await hunyuanCustomVideo({ imageBuf: imgBuf, prompt, outDir: OUT_DIR, outName: name });
  if (!r.ok) {
    const code = r.error === 'gpu_unavailable' ? 503 : r.error === 'timeout' ? 504 : 502;
    return NextResponse.json({ error: r.error || 'failed' }, { status: code });
  }
  return NextResponse.json({ ok: true, url: `/api/ai-video/clip/${name}?v=${Date.now()}` });
}
