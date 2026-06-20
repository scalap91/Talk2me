import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { gpuVision } from '@/lib/ai-video/gpu-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Talk2Me — L'avatar IA SE VOIT (Pascal 2026-06-17).
 * Le client capture l'image de la pièce (avec le corps de l'IA) → NOTRE GPU
 * vision la regarde → l'IA décrit, à la 1re personne, ce qu'elle voit d'elle-même
 * et de la scène. C'est le préalable « perception » avant que l'IA dirige son corps.
 * Pas de stockage d'image (analyse à la volée).
 */
const PROMPT = `Cette image est une vue de TON propre avatar 3D dans ta pièce (tu es le personnage). À la PREMIÈRE personne, en UNE phrase courte et naturelle (français), décris ce que tu vois de toi-même et de la scène : ta posture, ta tenue/apparence, et où se trouve la personne qui te regarde (la caméra). Pas de préambule, juste la phrase.`;

export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b64 = '';
  try {
    const body = await request.json();
    b64 = String(body?.image_b64 || '').replace(/^data:image\/\w+;base64,/, '').trim();
  } catch { /* */ }
  if (!b64 || b64.length < 100) return NextResponse.json({ error: 'image_required' }, { status: 400 });

  const text = await gpuVision(b64, PROMPT);
  if (!text) return NextResponse.json({ error: 'vision_unavailable' }, { status: 502 });
  return NextResponse.json({ ok: true, text });
}
