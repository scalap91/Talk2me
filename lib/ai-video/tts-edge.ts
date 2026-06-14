'use server-only';

/**
 * Voix MAISON gratuite (Pascal 2026-06-11 : « on peut pas créer un truc qui
 * ressemble à ElevenLabs, sans leur clé ? »). edge-tts = voix neuronales
 * Microsoft, GRATUITES, SANS CLÉ, sans limite. Tourne dans un venv local
 * (/home/ubuntu/tts-venv). Devient la voix PAR DÉFAUT du Studio ; ElevenLabs
 * reste une option premium (BYOK).
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { normalizeForSpeech } from '@/lib/ai-video/speech-text';

const PY = '/home/ubuntu/tts-venv/bin/python3';
const OUT_DIR = '/home/ubuntu/talktome/public/uploads/tts';

export interface EdgeVoice { id: string; name: string; desc: string }
export const EDGE_VOICES: EdgeVoice[] = [
  { id: 'fr-FR-DeniseNeural', name: 'Denise', desc: 'Féminine, naturelle' },
  { id: 'fr-FR-HenriNeural', name: 'Henri', desc: 'Masculine, posée' },
  { id: 'fr-FR-EloiseNeural', name: 'Éloïse', desc: 'Féminine, douce' },
  { id: 'fr-FR-RemyMultilingualNeural', name: 'Rémy', desc: 'Masculine, chaleureuse' },
  { id: 'fr-FR-VivienneMultilingualNeural', name: 'Vivienne', desc: 'Féminine, expressive' },
];

export function isEdgeAvailable(): boolean {
  return existsSync(PY);
}
export function defaultEdgeVoice(): string { return EDGE_VOICES[0].id; }
/** Une voix edge ? (id de la forme xx-YY-…Neural) */
export function isEdgeVoiceId(id?: string): boolean {
  return !!id && /Neural$/.test(id);
}

/** Synthétise une narration via edge-tts → MP3 local (chemin absolu) ou null. */
export function synthesizeVoiceEdge(text: string, voiceId?: string): Promise<string | null> {
  return new Promise(async (resolve) => {
    const t = normalizeForSpeech((text || '').trim(), 'fr');
    if (!t || !isEdgeAvailable()) return resolve(null);
    const voice = isEdgeVoiceId(voiceId) ? voiceId! : defaultEdgeVoice();
    try {
      if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
      const out = path.join(OUT_DIR, `edge-${randomUUID()}.mp3`);
      const child = spawn(PY, ['-m', 'edge_tts', '--voice', voice, '--text', t.slice(0, 800), '--write-media', out], { stdio: ['ignore', 'ignore', 'pipe'] });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 45000);
      child.on('error', () => { clearTimeout(to); resolve(null); });
      child.on('close', (code) => {
        clearTimeout(to);
        resolve(code === 0 && existsSync(out) ? out : null);
      });
    } catch { resolve(null); }
  });
}
