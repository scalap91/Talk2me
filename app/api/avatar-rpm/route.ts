/**
 * Talk2Me — POST /api/avatar-rpm (Pascal 2026-06-13).
 * Reçoit l'URL GLB d'un avatar Ready Player Me créé in-app, le télécharge et
 * l'héberge chez nous (uploads). Renvoie l'URL locale (+ usdz si converti).
 * Body : { glb_url }  →  { ok, glb, usdz? }
 * (USDZ iOS : conversion Blender côté pod, branchée ensuite.)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UP = process.cwd() + '/public/uploads';

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { glb_url?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const url = body.glb_url || '';
  if (!/^https:\/\/(models\.)?readyplayer\.me\//.test(url) && !/\.glb($|\?)/.test(url)) {
    return NextResponse.json({ error: 'bad_url' }, { status: 400 });
  }
  try {
    // qualité optimisée pour l'AR mobile
    const dl = url.includes('?') ? url : url + '?quality=medium&meshLod=1&textureSizeLimit=1024';
    const r = await fetch(dl, { signal: AbortSignal.timeout(45000) });
    if (!r.ok) return NextResponse.json({ error: 'download_failed', status: r.status }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 4096) return NextResponse.json({ error: 'too_small' }, { status: 502 });
    if (!existsSync(UP)) await mkdir(UP, { recursive: true });
    const id = randomUUID();
    await writeFile(path.join(UP, `${id}.glb`), buf);
    return NextResponse.json({ ok: true, glb: `/uploads/${id}.glb`, size: buf.length });
  } catch (e) {
    return NextResponse.json({ error: 'rpm_error', detail: (e as Error).message }, { status: 502 });
  }
}
