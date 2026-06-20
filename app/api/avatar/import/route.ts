import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateAiAvatarBody } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'public', 'uploads', 'streamoji');

/**
 * Talk2Me — Importer un CORPS GLB (Pascal 2026-06-17).
 *   • { url }    : GLB exporté par Avaturn (mode « Depuis ma photo », démo) →
 *                  le serveur le récupère et l'héberge CHEZ NOUS.
 *   • { glb_b64 }: GLB uploadé à la main (avatar créé gratuitement ailleurs :
 *                  hub.avaturn.me, Ready Player Me, Mixamo…).
 * Le corps devient celui de l'avatar IA du user, animé par notre moteur.
 * Tout GLB riggé standard (Hips/Spine/…) marche avec nos animations.
 */
export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let url = '', b64 = '';
  try {
    const body = await request.json();
    url = String(body?.url || '').trim();
    b64 = String(body?.glb_b64 || '').replace(/^data:[^,]*,/, '').trim();
  } catch { /* */ }

  let buf: Buffer | null = null;
  try {
    if (b64) {
      buf = Buffer.from(b64, 'base64');
    } else if (/^https?:\/\//i.test(url)) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
      buf = Buffer.from(await r.arrayBuffer());
    }
  } catch {
    return NextResponse.json({ error: 'read_failed' }, { status: 502 });
  }
  if (!buf || buf.length < 12 || buf.toString('ascii', 0, 4) !== 'glTF') {
    return NextResponse.json({ error: 'not_a_glb' }, { status: 400 });
  }
  if (buf.length > 40 * 1024 * 1024) {
    return NextResponse.json({ error: 'too_big' }, { status: 413 });
  }

  try {
    await mkdir(DIR, { recursive: true });
    const fname = `body-${user.id}.glb`;
    await writeFile(path.join(DIR, fname), buf);
    const publicUrl = `/uploads/streamoji/${fname}?v=${buf.length}`;
    updateAiAvatarBody(user.id, publicUrl, url ? `import:${url.slice(0, 200)}` : 'import:upload');
    return NextResponse.json({ ok: true, url: publicUrl, bytes: buf.length });
  } catch (e) {
    return NextResponse.json({ error: 'save_failed', detail: String((e as Error)?.message || '').slice(0, 120) }, { status: 500 });
  }
}
