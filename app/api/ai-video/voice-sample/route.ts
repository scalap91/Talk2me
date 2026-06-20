/**
 * Studio Vidéo IA — GET /api/ai-video/voice-sample?voiceId=... (Pascal 2026-06-11).
 * Pré-écoute d'une voix : renvoie { url } d'un court échantillon MP3, mis en
 * CACHE (généré une seule fois par voix). edge-tts (gratuit) pour les voix
 * maison ; ElevenLabs (clé plateforme) pour les voix premium.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { synthesizeVoiceEdge, isEdgeVoiceId } from '@/lib/ai-video/tts-edge';
import { synthesizeVoice, isVoiceEnabled } from '@/lib/ai-video/elevenlabs';
import { gpuTts } from '@/lib/ai-video/gpu-worker';
import { getAiKey } from '@/lib/ai-keys';
import { existsSync } from 'fs';
import { mkdir, rename } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DIR = process.cwd() + '/public/uploads/voice-samples';
const SAMPLE = 'Bonjour, voici un aperçu de ma voix sur Talk2Me.';

export async function GET(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const voiceId = new URL(req.url).searchParams.get('voiceId') || '';
  if (!voiceId) return NextResponse.json({ error: 'voiceId_required' }, { status: 400 });

  const safe = voiceId.replace(/[^A-Za-z0-9_-]/g, '');
  const rel = `/uploads/voice-samples/${safe}.mp3`;
  const dest = path.join(CACHE_DIR, `${safe}.mp3`);
  if (existsSync(dest)) return NextResponse.json({ url: rel, cached: true });

  // génère l'échantillon
  let tmp: string | null = null;
  if (voiceId === 'gpu-xtts') {
    tmp = await gpuTts(SAMPLE, 'fr'); // NOTRE voix maison
    if (!tmp) tmp = await synthesizeVoiceEdge(SAMPLE); // repli
  } else if (isEdgeVoiceId(voiceId)) {
    tmp = await synthesizeVoiceEdge(SAMPLE, voiceId);
  } else {
    const elevenKey = getAiKey(user.id, 'elevenlabs') || undefined;
    if (elevenKey || isVoiceEnabled()) tmp = await synthesizeVoice(SAMPLE, voiceId, elevenKey);
    if (!tmp) tmp = await synthesizeVoiceEdge(SAMPLE); // repli voix maison
  }
  if (!tmp) return NextResponse.json({ error: 'sample_failed' }, { status: 500 });
  try {
    if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
    await rename(tmp, dest);
  } catch { return NextResponse.json({ error: 'cache_failed' }, { status: 500 }); }
  return NextResponse.json({ url: rel });
}
