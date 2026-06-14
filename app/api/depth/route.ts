/**
 * Talk2Me — POST /api/depth (Pascal 2026-06-13).
 * Proxy serveur vers le worker GPU /depth (Depth Anything V2).
 * La caméra envoie une frame (image_b64) → renvoie la carte de profondeur réelle.
 * Le token GPU reste côté serveur (jamais exposé au client).
 * Body : { image_b64 }  →  { ok, depth_b64, w, h }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const base = process.env.GPU_WORKER_URL;
  if (!base) return NextResponse.json({ error: 'gpu_off' }, { status: 503 });
  let body: { image_b64?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!body.image_b64) return NextResponse.json({ error: 'image_required' }, { status: 400 });
  try {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' };
    if (process.env.GPU_WORKER_TOKEN) h.Authorization = `Bearer ${process.env.GPU_WORKER_TOKEN}`;
    const r = await fetch(`${base.replace(/\/$/, '')}/depth`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ image_b64: body.image_b64 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return NextResponse.json({ error: 'depth_failed', status: r.status }, { status: 502 });
    const d = await r.json();
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: 'depth_error', detail: (e as Error).message }, { status: 502 });
  }
}
