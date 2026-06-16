/**
 * Studio Vidéo IA — GET /api/ai-video/options (Pascal 2026-06-10).
 * Renvoie l'état des capacités : voix dispo (clé ElevenLabs), liste voix, musiques.
 */
import { NextResponse } from 'next/server';
import { isVoiceEnabled, VOICES } from '@/lib/ai-video/elevenlabs';
import { isEdgeAvailable, EDGE_VOICES } from '@/lib/ai-video/tts-edge';
import { gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import { readFileSync } from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let music: { id: string; name: string; category: string }[] = [];
  try {
    const lib = JSON.parse(readFileSync(process.cwd() + '/public/audio-lib/index.json', 'utf8')) as { id: string; name: string; category: string }[];
    music = lib.map((t) => ({ id: t.id, name: t.name, category: t.category }));
  } catch { /* ignore */ }
  // NOTRE VOIX (XTTS sur notre GPU) en TÊTE — 100% maison, illimitée (Pascal 2026-06-11).
  const gpu = gpuWorkerAvailable()
    ? [{ id: 'gpu-xtts', name: 'Talk2Me — Voix maison', gender: 'neutre', tier: 'gpu' as const }]
    : [];
  // Voix edge-tts (Microsoft) + ElevenLabs (premium) en secours.
  const edge = isEdgeAvailable() ? EDGE_VOICES.map((v) => ({ ...v, tier: 'free' as const })) : [];
  const eleven = isVoiceEnabled() ? VOICES.map((v) => ({ ...v, tier: 'premium' as const })) : [];
  return NextResponse.json({
    voiceAvailable: gpuWorkerAvailable() || isEdgeAvailable() || isVoiceEnabled(),
    voices: [...gpu, ...edge, ...eleven],
    music,
  });
}
