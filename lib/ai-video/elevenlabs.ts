'use server-only';

/**
 * Studio Vidéo IA — voix off ElevenLabs (Pascal 2026-06-10).
 * GATED sur process.env.ELEVENLABS_API_KEY : sans clé, isVoiceEnabled()=false
 * et le studio retombe sur « musique + sous-titres » (aucune promesse non tenue,
 * cf doctrine [[feedback_api_keys_signal]] / [[feedback_verifier_rail_paiement]]).
 * Dès que Pascal envoie la clé → la voix s'active sans changement de code.
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { normalizeForSpeech } from '@/lib/ai-video/speech-text';
import { randomUUID } from 'crypto';
import path from 'path';

const TMP_DIR = '/home/ubuntu/talktome/public/uploads/tts';

export interface VoiceOption { id: string; name: string; desc: string }

/**
 * Voix multilingues ElevenLabs utilisables en plan GRATUIT (vérifié 2026-06-11 :
 * Josh/Charlotte/Rachel = 402 paid_plan_required pour les comptes free). On
 * garde Sarah + Adam (HTTP 200 en gratuit). SAFE_VOICE = repli si 402.
 */
export const VOICES: VoiceOption[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Féminine, claire, posée' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Masculine, profonde' },
];
const SAFE_VOICE = 'EXAVITQu4vr4xnSDxMaL';

export function isVoiceEnabled(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

export function defaultVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || VOICES[0].id;
}

/**
 * Synthétise une ligne de narration → fichier MP3 (chemin absolu). Retourne null
 * si pas de clé ou échec (le rendu continuera sans cette voix).
 */
/** Un appel TTS. Retourne {ok, status, buf}. */
async function ttsCall(key: string, voice: string, text: string): Promise<{ status: number; buf: Buffer | null }> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: text.slice(0, 600),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { status: res.status, buf: null };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: 200, buf: buf.length >= 256 ? buf : null };
  } catch {
    return { status: 0, buf: null };
  }
}

/**
 * Synthétise une narration → MP3. `apiKey` optionnel = clé de l'user (BYOK) ;
 * sinon clé plateforme. Si la voix demandée est payante (402), repli auto sur
 * SAFE_VOICE (gratuite) pour ne jamais planter le rendu.
 */
export async function synthesizeVoice(text: string, voiceId?: string, apiKey?: string): Promise<string | null> {
  const key = apiKey || process.env.ELEVENLABS_API_KEY;
  const t = (text || '').trim();
  if (!key || !t) return null;
  const voice = voiceId || defaultVoiceId();
  let r = await ttsCall(key, voice, t);
  if (!r.buf && r.status === 402 && voice !== SAFE_VOICE) r = await ttsCall(key, SAFE_VOICE, t);
  if (!r.buf) return null;
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
  const out = path.join(TMP_DIR, `tts-${randomUUID()}.mp3`);
  await writeFile(out, r.buf);
  return out;
}
