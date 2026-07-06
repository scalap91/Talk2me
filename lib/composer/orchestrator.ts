'use server-only';

/**
 * Talk2Me — COMPOSER : orchestrateur de contenu 7 couches (Pascal 2026-06-12).
 *
 *   Demande user
 *     ↓ 1. Intent Router      — vidéo|post|réponse|image|avatar|musique|article|recherche
 *     ↓ 2. Scenario Builder   — titre, angle, durée, scènes, texte, ton, format
 *     ↓ 3. Format Selector    — post texte|card|vidéo avatar|vidéo montage|image|carrousel
 *     ↓ 4. Asset Planner       — voix, avatar, image, vidéo, musique, sous-titres
 *     ↓ 5. Engine Dispatcher  — XTTS, SDXL, LivePortrait, MuseTalk, FFmpeg, recherche web
 *     ↓ 6. Assembly Layer     — audio+vidéo+sous-titres+intro/outro+format mobile
 *     ↓ 7. Publisher          — feed (caption, hashtags, preview, source, statut)
 *
 * Universel : ne sort pas QUE de la vidéo. Chaque couche = une fonction claire.
 * Moteurs réutilisés (pas réécrits) : lib/ai-video/* , gpu-worker, db.
 */

import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { gpuLlm, gpuWorkerAvailable, gpuImage, gpuTts } from '@/lib/ai-video/gpu-worker';
import { fetchBackgroundImage } from '@/lib/ai-video/images';
import { renderAiVideo, type Ratio, type RenderSegment } from '@/lib/ai-video/render';
import { createDirectCard } from '@/lib/db';

// ============================ TYPES ============================
export type ContentType =
  | 'video' | 'post' | 'image' | 'avatar' | 'music' | 'article' | 'search' | 'carousel';
export type RenderFormat =
  | 'text_post' | 'card' | 'avatar_video' | 'montage_video' | 'image' | 'carousel';
export type AssetKind = 'voice' | 'avatar' | 'image' | 'video' | 'music' | 'subtitles' | 'text';

export interface Scene { caption: string; narration: string; visual: string; }
export interface Scenario {
  title: string;
  angle: string;
  ton: string;
  duration_sec: number;
  ratio: Ratio;
  text: string;            // pour post / card texte
  cta: string;
  hashtags: string[];
  scenes: Scene[];
}
export interface ComposeResult {
  ok: boolean;
  intent: ContentType;
  format: RenderFormat;
  assets: AssetKind[];
  cardId: string | null;
  kind: 'video' | 'image' | 'texte';   // type de card publié
  media_url?: string | null;
  text?: string | null;
  title: string;
  error?: string;
}

// ============================ 1. INTENT ROUTER ============================
function deepseek(): OpenAI | null {
  const k = process.env.DEEPSEEK_API_KEY;
  return k ? new OpenAI({ apiKey: k, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 45000, maxRetries: 1 }) : null;
}

async function llmJson(system: string, user: string): Promise<string | null> {
  if (gpuWorkerAvailable()) {
    const out = await gpuLlm(user, { system, json: true, temperature: 0.5 });
    if (out) return out;
  }
  const c = deepseek();
  if (c) {
    try {
      const r = await c.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      });
      recordLlmUsage(process.env.DEEPSEEK_MODEL || 'deepseek-chat', r.usage, 'composer');
      return r.choices?.[0]?.message?.content || null;
    } catch { /* */ }
  }
  return null;
}

const INTENTS: ContentType[] = ['video', 'post', 'image', 'avatar', 'music', 'article', 'search', 'carousel'];

/** Couche 1 : classe la demande en TYPE de contenu. */
export async function routeIntent(request: string): Promise<ContentType> {
  const sys =
    `Tu classes une demande user en UN type de contenu. Réponds JSON {"intent": "..."} parmi : ` +
    INTENTS.join(', ') + `.\n` +
    `Règles: "fais/écris un post|texte" → post ; "génère/fais une image|photo" → image ; ` +
    `"fais une vidéo" → video ; "présentateur|avatar qui parle" → avatar ; "carrousel|plusieurs images" → carousel ; ` +
    `"article|blog" → article ; "cherche|trouve" → search ; "musique|chanson" → music.`;
  const raw = await llmJson(sys, request);
  try {
    const v = (JSON.parse(raw || '{}').intent || '').toString().toLowerCase();
    if ((INTENTS as string[]).includes(v)) return v as ContentType;
  } catch { /* */ }
  // repli heuristique
  const r = request.toLowerCase();
  if (/\bpost\b|écris|rédige|texte/.test(r)) return 'post';
  if (/image|photo|visuel|dessin/.test(r)) return 'image';
  if (/avatar|présentat|parle face/.test(r)) return 'avatar';
  if (/carrousel|carousel|plusieurs images/.test(r)) return 'carousel';
  if (/article|blog/.test(r)) return 'article';
  if (/cherche|trouve|recherche/.test(r)) return 'search';
  return 'video';
}

// ============================ 2. SCENARIO BUILDER ============================
const VALID_RATIO: Ratio[] = ['9:16', '1:1', '16:9'];
/** Coerce n'importe quelle valeur LLM (string|array|number|null) en string sûre. */
function asStr(x: unknown): string {
  if (x == null) return '';
  if (Array.isArray(x)) return x.map((y) => asStr(y)).filter(Boolean).join(' ');
  return String(x);
}
function clampCaption(s: unknown): string {
  const t = asStr(s).replace(/\s+/g, ' ').trim();
  if (t.length <= 32) return t; const cut = t.slice(0, 32); const sp = cut.lastIndexOf(' ');
  return (sp > 16 ? cut.slice(0, sp) : cut).trim();
}

/** Couche 2 : transforme la demande en mini-scénario (titre/angle/ton/durée/scènes/texte). */
export async function buildScenario(request: string, intent: ContentType): Promise<Scenario> {
  const wantScenes = intent === 'video' || intent === 'avatar' ? 4 : intent === 'carousel' ? 5 : 1;
  const sys =
    `Tu es directeur créatif. Demande user (intent=${intent}). Produis un JSON STRICT :\n` +
    `{"title":string,"angle":string,"ton":string,"duration_sec":number,"ratio":"9:16"|"1:1"|"16:9",` +
    `"text":string,"cta":string,"hashtags":[string],"scenes":[{"caption":string,"narration":string,"visual":string}]}\n` +
    `Règles: ton=1 mot. ratio 9:16 par défaut. text = le corps si c'est un post/texte (sinon court). ` +
    `scenes = ${wantScenes} (caption ≤32c, narration 1 phrase, visual 2-3 mots-clés EN). ` +
    `hashtags = 3-6 sans le #. N'invente AUCUN fait précis absent de la demande. JSON uniquement.`;
  const raw = await llmJson(sys, request);
  try {
    const p = JSON.parse(raw || '{}');
    const scenes: Scene[] = (p.scenes || []).filter((s: Scene) => s && (s.caption || s.narration)).slice(0, wantScenes)
      .map((s: Scene) => ({
        caption: clampCaption(s.caption ?? s.narration),
        narration: asStr(s.narration ?? s.caption).replace(/\s+/g, ' ').trim().slice(0, 240),
        visual: asStr(s.visual).replace(/\s+/g, ' ').trim().slice(0, 60),
      }));
    return {
      title: (p.title || request.slice(0, 60)).toString().slice(0, 120),
      angle: (p.angle || '').toString().slice(0, 120),
      ton: (p.ton || 'dynamique').toString().slice(0, 30),
      duration_sec: Math.max(5, Math.min(60, Number(p.duration_sec) || 15)),
      ratio: (VALID_RATIO as string[]).includes(p.ratio) ? p.ratio as Ratio : '9:16',
      text: (p.text || '').toString().slice(0, 2000),
      cta: (p.cta || '').toString().slice(0, 80),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h: unknown) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6) : [],
      scenes: scenes.length ? scenes : [{ caption: clampCaption(request), narration: request.slice(0, 240), visual: '' }],
    };
  } catch {
    return { title: request.slice(0, 80), angle: '', ton: 'dynamique', duration_sec: 15, ratio: '9:16', text: request.slice(0, 500), cta: '', hashtags: [], scenes: [{ caption: clampCaption(request), narration: request.slice(0, 240), visual: '' }] };
  }
}

// ============================ 3. FORMAT SELECTOR ============================
/** Couche 3 : choisit le rendu final à partir de l'intent (+ scénario). */
export function selectFormat(intent: ContentType): RenderFormat {
  switch (intent) {
    case 'post': case 'article': case 'search': return 'text_post';
    case 'image': return 'image';
    case 'carousel': return 'carousel';
    case 'avatar': return 'avatar_video';
    case 'music': case 'video': default: return 'montage_video';
  }
}

// ============================ 4. ASSET PLANNER ============================
/** Couche 4 : liste les ressources nécessaires selon le format. */
export function planAssets(format: RenderFormat): AssetKind[] {
  switch (format) {
    case 'text_post': return ['text'];
    case 'image': return ['image'];
    case 'carousel': return ['image'];
    case 'avatar_video': return ['avatar', 'voice', 'subtitles'];
    case 'montage_video': return ['image', 'voice', 'music', 'subtitles'];
    case 'card': default: return ['text'];
  }
}

// ============================ 5+6. DISPATCH + ASSEMBLY ============================
interface Produced { media_url?: string | null; posterUrl?: string | null; text?: string | null; kind: 'video' | 'image' | 'texte'; }

/** Couches 5 & 6 : appelle les moteurs + assemble selon le format. */
async function dispatchAndAssemble(format: RenderFormat, sc: Scenario, voiceover: boolean): Promise<Produced> {
  const portrait = sc.ratio === '9:16';

  if (format === 'text_post') {
    // pas de moteur média : le texte EST le contenu
    return { text: (sc.text || sc.scenes.map((x) => x.narration).join('\n\n')).trim(), kind: 'texte' };
  }

  if (format === 'image' || format === 'carousel') {
    // SDXL (notre GPU) sinon vraie photo de référence
    const q = sc.scenes[0]?.visual || sc.title;
    let img: string | null = null;
    if (gpuWorkerAvailable()) img = await gpuImage(`${q}, high detail, photorealistic`, portrait);
    if (!img) img = await fetchBackgroundImage(q) || await fetchBackgroundImage(sc.title);
    const media_url = img ? toWebUrl(img) : null;
    return { media_url, kind: 'image' };
  }

  // montage_video : 100% INTERNE (notre GPU). Image = SDXL, voix = XTTS.
  // Aucune source/clé externe (ni Pexels, ni stock). Repli Openverse seulement si SDXL down.
  const segments: RenderSegment[] = await Promise.all(sc.scenes.map(async (s) => {
    const q = s.visual || s.caption || sc.title;
    const voicePath = voiceover && gpuWorkerAvailable() ? await gpuTts(s.narration, 'fr') : null;
    let imagePath: string | null = gpuWorkerAvailable() ? await gpuImage(`${q}, photorealistic, high detail`, portrait) : null;
    if (!imagePath) imagePath = await fetchBackgroundImage(q);
    console.log(`[COMPOSER] 5.scene: image(SDXL)->${imagePath ? imagePath.split('/').pop() : '∅'} | voix(XTTS)->${voicePath ? 'ok' : 'off'}`);
    return { caption: s.caption, videoPath: null, imagePath, voicePath };
  }));
  const out = await renderAiVideo({ segments, ratio: sc.ratio, musicPath: null, transition: 'fade' });
  console.log(`[COMPOSER] 6.renderAiVideo(ffmpeg) -> ${out.url}`);
  return { media_url: out.url, posterUrl: out.posterUrl, kind: 'video' };
}

const PUBLIC = process.cwd() + '/public';
function toWebUrl(p: string | null): string | null {
  if (!p) return null;
  if (p.startsWith('/uploads/')) return p;
  if (p.startsWith(PUBLIC)) return p.slice(PUBLIC.length);
  return null;
}

// ============================ 7. PUBLISHER ============================
/** Couche 7 : publie dans le feed (card) avec caption + hashtags. */
function publish(userId: string, produced: Produced, sc: Scenario): string | null {
  const tags = sc.hashtags.length ? ' ' + sc.hashtags.map((h) => '#' + h).join(' ') : '';
  const caption = ([sc.title, sc.cta].filter(Boolean).join(' — ') + tags).slice(0, 280);
  try {
    if (produced.kind === 'texte') {
      const card = createDirectCard(userId, { type: 'texte', text: produced.text || sc.text || sc.title, caption });
      return card.id;
    }
    const card = createDirectCard(userId, { type: produced.kind === 'image' ? 'image' : 'video', media_url: produced.media_url || null, caption });
    return card.id;
  } catch { return null; }
}

// ============================ ORCHESTRATEUR ============================
export async function compose(request: string, userId: string, opts?: { voiceover?: boolean; publish?: boolean }): Promise<ComposeResult> {
  const req = (request || '').trim();
  const T = Date.now().toString(36).slice(-6);
  const log = (m: string) => console.log(`[COMPOSER ${T}] ${m}`);
  log(`0 ENTREE compose() | request="${req.slice(0, 80)}" | gpuWorker=${gpuWorkerAvailable()}`);
  const intent = await routeIntent(req);                 // 1
  log(`1 routeIntent() -> intent=${intent}`);
  const scenario = await buildScenario(req, intent);     // 2
  log(`2 buildScenario() -> title="${scenario.title.slice(0, 50)}" ratio=${scenario.ratio} scenes=${scenario.scenes.length}`);
  const format = selectFormat(intent);                   // 3
  log(`3 selectFormat(${intent}) -> format=${format}`);
  const assets = planAssets(format);                     // 4
  log(`4 planAssets(${format}) -> [${assets.join(',')}]`);
  log(`5 dispatchAndAssemble() -> moteurs…`);
  const produced = await dispatchAndAssemble(format, scenario, opts?.voiceover !== false); // 5+6
  log(`6 assemblé -> kind=${produced.kind} media_url=${produced.media_url ?? produced.text?.slice(0, 30) ?? 'null'}`);
  const cardId = opts?.publish === false ? null : publish(userId, produced, scenario);     // 7
  log(`7 publish() -> createDirectCard -> cardId=${cardId}`);
  return {
    ok: true, intent, format, assets, cardId,
    kind: produced.kind, media_url: produced.media_url ?? null, text: produced.text ?? null,
    title: scenario.title,
  };
}
