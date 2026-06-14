'use server-only';

/**
 * Studio Vidéo IA — générateur de script (Pascal 2026-06-10).
 * DeepSeek transforme un sujet en scénario vidéo court : titre + N segments,
 * chaque segment = une caption (texte incrusté, court) + une narration (voix off).
 * Grounding : on ne fabrique pas de faits, on met en forme le sujet donné par l'user.
 */

import OpenAI from 'openai';
import { gpuLlm, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';

export interface VideoSegment {
  caption: string;   // texte incrusté à l'écran (court, ≤ 32 car.)
  narration: string; // ligne de voix off (1 phrase)
  visual?: string;   // mot-clé EN pour chercher une image de fond (banque gratuite)
}
export interface VideoScript {
  title: string;
  segments: VideoSegment[];
}

function client(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 40000, maxRetries: 1 });
}

/** Coupe proprement une caption à 32 car. sur une frontière de mot. */
function clampCaption(s: string): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 32) return t;
  const cut = t.slice(0, 32);
  const sp = cut.lastIndexOf(' ');
  return (sp > 16 ? cut.slice(0, sp) : cut).trim();
}

/**
 * Génère un script vidéo. nbSegments borné [3..6]. Si DeepSeek indispo ou
 * réponse illisible → fallback déterministe (découpe du sujet en phrases).
 */
export async function generateVideoScript(topic: string, opts?: { segments?: number; lang?: string }): Promise<VideoScript> {
  const want = Math.min(Math.max(opts?.segments ?? 5, 3), 6);
  const lang = opts?.lang || 'français';
  const cleanTopic = (topic || '').trim().slice(0, 1200);

  const SYS =
    `Tu es scénariste de vidéos sociales courtes (Reels/TikTok/Shorts) en ${lang}. ` +
    `À partir d'un sujet, produis un JSON {"title": string, "segments": [{"caption": string, "narration": string, "visual": string}]}. ` +
    `Règles STRICTES : ${want} segments. caption = texte percutant incrusté à l'écran, MAX 32 caractères, sans emoji, sans hashtag. ` +
    `narration = UNE phrase parlée naturelle (voix off), 8 à 18 mots. ` +
    `visual = 2-3 mots-clés EN ANGLAIS, concrets et visuels, pour générer une image (ex. "person sleeping bedroom", "calm ocean sunset"). ` +
    `Reste fidèle au sujet, n'invente aucun fait précis (chiffres, dates, noms) non présent dans le sujet. Réponds UNIQUEMENT le JSON, pas de markdown.`;

  const parse = (raw: string): VideoScript | null => {
    try {
      const parsed = JSON.parse(raw) as Partial<VideoScript>;
      const segs = (parsed.segments || [])
        .filter((s) => s && (s.caption || s.narration))
        .slice(0, want)
        .map((s) => ({ caption: clampCaption(s.caption || s.narration || ''), narration: (s.narration || s.caption || '').replace(/\s+/g, ' ').trim().slice(0, 240), visual: (s.visual || '').replace(/\s+/g, ' ').trim().slice(0, 60) }));
      if (segs.length >= 2) return { title: (parsed.title || cleanTopic).slice(0, 120), segments: segs };
    } catch { /* */ }
    return null;
  };

  // 1) NOTRE GPU (Ollama/Llama) en priorité — zéro service externe (Pascal 2026-06-11)
  if (gpuWorkerAvailable() && cleanTopic) {
    const out = await gpuLlm(cleanTopic, { system: SYS, json: true, temperature: 0.7 });
    if (out) { const r = parse(out); if (r) return r; }
  }

  // 2) DeepSeek en secours (si pas de GPU configuré)
  const c = client();
  if (c && cleanTopic) {
    try {
      const completion = await c.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [ { role: 'system', content: SYS }, { role: 'user', content: cleanTopic } ],
      });
      const r = parse(completion.choices?.[0]?.message?.content || '');
      if (r) return r;
    } catch { /* fallback ci-dessous */ }
  }
  // Fallback déterministe : on découpe le sujet en phrases.
  const sentences = cleanTopic.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const base = sentences.length ? sentences : [cleanTopic || 'Talk2Me'];
  const segments: VideoSegment[] = [];
  for (let i = 0; i < Math.min(want, Math.max(2, base.length)); i++) {
    const line = base[i % base.length];
    segments.push({ caption: clampCaption(line), narration: line.slice(0, 240) });
  }
  return { title: (base[0] || 'Talk2Me').slice(0, 120), segments };
}
