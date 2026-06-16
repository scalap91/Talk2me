/**
 * Talk2Me R&D — POST /api/rd/avatar-i2i (Pascal 2026-06-13).
 * Bac à sable "tourne-autour photoréaliste". Reçoit UNE vue 3D de Léa (rendue dans
 * le navigateur, b64) + l'angle, la passe en SDXL img2img sur NOTRE GPU → frame
 * PHOTORÉALISTE. "Le 3D contrôle (la pose), la diffusion réalise (le rendu)."
 * Isolé : ne touche ni au feed, ni au composer, ni à la prod.
 * → { ok, url }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMG_DIR = process.cwd() + '/public/uploads'; // racine /uploads (les sous-dossiers ne sont PAS servis)
const PUBLIC = process.cwd() + '/public';

const PHOTO_PROMPT =
  'photorealistic portrait of a young woman, same pose and framing, natural realistic skin texture, ' +
  'soft studio lighting, neutral grey background, detailed eyes, casual top, high detail, 85mm photo, ' +
  'realistic hair, sharp focus, no cartoon, no anime, no 3d render look';

export async function POST(req: NextRequest) {
  const base = process.env.GPU_WORKER_URL;
  if (!base) return NextResponse.json({ ok: false, error: 'GPU_WORKER_URL manquant' }, { status: 500 });
  let body: { image_b64?: string; strength?: number; seed?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'json' }, { status: 400 }); }
  const image_b64 = (body.image_b64 || '').replace(/^data:image\/\w+;base64,/, '');
  if (image_b64.length < 1000) return NextResponse.json({ ok: false, error: 'image vide' }, { status: 400 });
  const strength = Math.min(0.85, Math.max(0.25, body.strength ?? 0.55));

  try {
    const wbody: Record<string, unknown> = {
      prompt: PHOTO_PROMPT, image_b64, width: 768, height: 1344, strength, steps: 8,
    };
    if (typeof body.seed === 'number') wbody.seed = body.seed; // même seed → cohérence entre angles
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.GPU_WORKER_TOKEN) headers['Authorization'] = `Bearer ${process.env.GPU_WORKER_TOKEN}`;
    const res = await fetch(`${base.replace(/\/$/, '')}/img2img`, {
      method: 'POST', headers, body: JSON.stringify(wbody), signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `worker ${res.status}` }, { status: 502 });
    const d = (await res.json()) as { b64?: string };
    if (!d.b64) return NextResponse.json({ ok: false, error: 'pas de sortie' }, { status: 502 });
    const buf = Buffer.from(d.b64, 'base64');
    if (buf.length < 2048) return NextResponse.json({ ok: false, error: 'sortie trop petite' }, { status: 502 });
    if (!existsSync(IMG_DIR)) await mkdir(IMG_DIR, { recursive: true });
    const out = path.join(IMG_DIR, `${randomUUID()}.png`);
    await writeFile(out, buf);
    return NextResponse.json({ ok: true, url: out.slice(PUBLIC.length) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
