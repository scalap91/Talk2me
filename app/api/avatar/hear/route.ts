import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { gpuStt } from '@/lib/ai-video/gpu-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Talk2Me — LES OREILLES de l'avatar IA (Pascal 2026-06-17).
 * Audio (micro / flux live) → NOTRE GPU /stt → texte. L'avatar « entend ».
 * Le client renvoie ensuite ce texte à /api/chat (elle répond + parle).
 * Pas de stockage audio (transcription à la volée).
 */
export async function POST(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b64 = '';
  try {
    const body = await request.json();
    b64 = String(body?.audio_b64 || '').replace(/^data:audio\/\w+;base64,/, '').trim();
  } catch { /* */ }
  if (!b64 || b64.length < 100) return NextResponse.json({ error: 'audio_required' }, { status: 400 });

  const text = await gpuStt(b64, 'fr');
  if (text == null) return NextResponse.json({ error: 'stt_unavailable' }, { status: 502 });
  return NextResponse.json({ ok: true, text });
}
