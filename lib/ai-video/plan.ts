'use server-only';

/**
 * Talk2Me — A. PLAN VIDÉO (Pascal 2026-06-12).
 * Le Composer transforme une DEMANDE LIBRE de l'user en PLAN STRUCTURÉ exploitable
 * par le routeur visuel (B) et le montage. Remplace le « script plat ».
 *
 * Flux : demande → [LLM] → { intent, format, ton, presenter, visual_strategy,
 *                            segments[], cta, publication_target, title }
 *
 * Doctrine [[content-grounding]] : on n'invente aucun fait précis non présent dans
 * la demande. Le LLM STRUCTURE l'intention, il ne fabrique pas de données.
 */

import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { gpuLlm, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import type { VideoSegment } from '@/lib/ai-video/script';

export type VisualStrategy = 'real_photos' | 'text_cards' | 'img2img' | 'avatar' | 'mixed';
export type Ratio = '9:16' | '1:1' | '16:9';

export interface VideoPlan {
  title: string;                 // titre de la vidéo
  intent: string;                // ex: promo_produit | explication | recette | annonce | storytelling | autre
  format: Ratio;                 // ratio cible
  ton: string;                   // ex: dynamique | premium | chaleureux | sérieux
  presenter: boolean;            // un présentateur (avatar) parle-t-il ? (câblé plus tard)
  visual_strategy: VisualStrategy;
  segments: VideoSegment[];      // plans : caption (≤32c) + narration (1 phrase) + visual (mots-clés EN)
  cta: string;                   // appel à l'action final (court)
  publication_target: 'feed' | 'draft';
}

const VALID_RATIO: Ratio[] = ['9:16', '1:1', '16:9'];
const VALID_STRAT: VisualStrategy[] = ['real_photos', 'text_cards', 'img2img', 'avatar', 'mixed'];

function clampCaption(s: string): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 32) return t;
  const cut = t.slice(0, 32); const sp = cut.lastIndexOf(' ');
  return (sp > 16 ? cut.slice(0, sp) : cut).trim();
}

function deepseek(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 45000, maxRetries: 1 });
}

function buildSys(want: number): string {
  return (
    `Tu es directeur créatif de vidéos sociales courtes (Reels/TikTok/Shorts) en français. ` +
    `À partir d'une DEMANDE libre, produis un PLAN JSON STRICT :\n` +
    `{"title":string,"intent":string,"format":"9:16"|"1:1"|"16:9","ton":string,` +
    `"presenter":boolean,"visual_strategy":"real_photos"|"text_cards"|"img2img"|"mixed",` +
    `"segments":[{"caption":string,"narration":string,"visual":string}],` +
    `"cta":string,"publication_target":"feed"}\n` +
    `RÈGLES :\n` +
    `- intent : classe la demande (promo_produit, explication, recette, annonce, storytelling, autre).\n` +
    `- format : 9:16 par défaut (vertical social) sauf si la demande implique autre chose.\n` +
    `- ton : un mot (dynamique, premium, chaleureux, sérieux…).\n` +
    `- presenter : true SEULEMENT si la demande veut explicitement quelqu'un qui parle face caméra ; sinon false.\n` +
    `- visual_strategy : "real_photos" par défaut (vraies photos de référence) ; "text_cards" si sujet abstrait sans visuel évident ; "img2img" si on doit reproduire fidèlement un objet/produit précis ; "mixed" si ça mélange.\n` +
    `- segments : EXACTEMENT ${want}. caption = texte incrusté MAX 32 caractères, sans emoji/hashtag. narration = UNE phrase parlée (8-18 mots). visual = 2-3 mots-clés EN concrets pour trouver une image.\n` +
    `- cta : appel à l'action court (≤ 60 c).\n` +
    `- N'invente AUCUN fait précis (chiffre, date, nom) absent de la demande.\n` +
    `Réponds UNIQUEMENT le JSON, pas de markdown.`
  );
}

function parsePlan(raw: string, want: number, fallbackTitle: string): VideoPlan | null {
  try {
    const p = JSON.parse(raw) as Partial<VideoPlan>;
    const segs = (p.segments || [])
      .filter((s) => s && (s.caption || s.narration))
      .slice(0, want)
      .map((s) => ({
        caption: clampCaption(s.caption || s.narration || ''),
        narration: (s.narration || s.caption || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        visual: (s.visual || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      }));
    if (segs.length < 2) return null;
    const format = (VALID_RATIO as string[]).includes(p.format as string) ? (p.format as Ratio) : '9:16';
    const visual_strategy = (VALID_STRAT as string[]).includes(p.visual_strategy as string)
      ? (p.visual_strategy as VisualStrategy) : 'real_photos';
    return {
      title: (p.title || fallbackTitle).toString().slice(0, 120),
      intent: (p.intent || 'autre').toString().slice(0, 40),
      format,
      ton: (p.ton || 'dynamique').toString().slice(0, 30),
      presenter: !!p.presenter,
      visual_strategy,
      segments: segs,
      cta: (p.cta || '').toString().slice(0, 80),
      publication_target: p.publication_target === 'draft' ? 'draft' : 'feed',
    };
  } catch { return null; }
}

/** Plan déterministe de repli (si LLM indispo) : découpe la demande en phrases. */
function fallbackPlan(request: string, want: number): VideoPlan {
  const clean = (request || '').trim().slice(0, 1200);
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const base = sentences.length ? sentences : [clean || 'Talk2Me'];
  const segments: VideoSegment[] = [];
  for (let i = 0; i < Math.min(want, Math.max(2, base.length)); i++) {
    const line = base[i % base.length];
    segments.push({ caption: clampCaption(line), narration: line.slice(0, 240), visual: '' });
  }
  return {
    title: (base[0] || 'Talk2Me').slice(0, 120),
    intent: 'autre', format: '9:16', ton: 'dynamique', presenter: false,
    visual_strategy: 'real_photos', segments, cta: '', publication_target: 'feed',
  };
}

/**
 * Construit le plan structuré depuis une demande libre. nbSegments borné [3..6].
 * GPU (Qwen/Llama) en priorité, DeepSeek en repli, plan déterministe en dernier.
 */
export async function buildVideoPlan(request: string, opts?: { segments?: number }): Promise<VideoPlan> {
  const want = Math.min(Math.max(opts?.segments ?? 4, 3), 6);
  const clean = (request || '').trim().slice(0, 1200);
  if (!clean) return fallbackPlan('Talk2Me', want);
  const SYS = buildSys(want);

  // 1) NOTRE GPU (Ollama)
  if (gpuWorkerAvailable()) {
    const out = await gpuLlm(clean, { system: SYS, json: true, temperature: 0.6 });
    if (out) { const r = parsePlan(out, want, clean.slice(0, 60)); if (r) return r; }
  }
  // 2) DeepSeek
  const c = deepseek();
  if (c) {
    try {
      const comp = await c.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYS }, { role: 'user', content: clean }],
      });
      recordLlmUsage(process.env.DEEPSEEK_MODEL || 'deepseek-chat', comp.usage, 'video-plan');
      const r = parsePlan(comp.choices?.[0]?.message?.content || '', want, clean.slice(0, 60));
      if (r) return r;
    } catch { /* repli */ }
  }
  // 3) déterministe
  return fallbackPlan(clean, want);
}
