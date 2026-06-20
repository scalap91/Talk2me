import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { gpuTts } from '@/lib/ai-video/gpu-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Talk2Me — LA VOIX de l'avatar IA (Pascal 2026-06-17).
 * Texte → NOTRE GPU /tts (XTTS) → fichier audio servi sous /uploads/tts.
 * La pièce le joue : l'avatar parle pour de vrai (et pourra s'entendre d'une
 * pièce à l'autre via le live P2P).
 */
export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let text = '';
  try {
    const body = await request.json();
    text = String(body?.text || '').trim().slice(0, 800);
  } catch { /* */ }
  if (!text) return NextResponse.json({ error: 'text_required' }, { status: 400 });

  const file = await gpuTts(text, 'fr');
  if (!file) return NextResponse.json({ error: 'tts_unavailable' }, { status: 502 });
  const url = '/uploads/tts/' + path.basename(file);
  return NextResponse.json({ ok: true, url });
}
