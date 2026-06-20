'use server-only';

/**
 * Talk2Me — Composer : PROJET ÉDITABLE (Pascal 2026-06-12).
 *
 * Un projet Composer = un plan JSON modifiable, pas une card figée :
 *  - scènes séparées, script éditable, assets séparés (voix/image/avatar/musique/sous-titres)
 *  - statut PAR BLOC (draft / rendered / modified / error)
 *  - cache : on ne régénère QUE les blocs invalidés (via le graphe de dépendances)
 *  - aperçu (rendu brouillon) puis publication feed.
 *
 * Pipeline : demande → createProject (plan, tout en draft, AUCUNE génération)
 *   → updateScene/updateGlobal (édition → invalidation sélective)
 *   → renderProject (régénère seulement les blocs modified/draft → assemble brouillon)
 *   → publishProject (card dans le feed).
 *
 * Réutilise les couches de l'orchestrateur (routeIntent/buildScenario/selectFormat)
 * et les moteurs (gpuTts/gpuImage/fetchBackgroundImage/renderAiVideo). Rien de réécrit.
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import path from 'path';
import { getDb } from '@/lib/db';
import { createDirectCard } from '@/lib/db';
import {
  routeIntent, buildScenario, selectFormat,
  type ContentType, type RenderFormat,
} from '@/lib/composer/orchestrator';
import { gpuWorkerAvailable, gpuImage, gpuTts, gpuXtts, gpuAvatar, gpuMotion } from '@/lib/ai-video/gpu-worker';
import { synthesizeVoiceEdge } from '@/lib/ai-video/tts-edge';
import { sdxlSceneImage, sdxlAvailable } from '@/lib/ai-video/sdxl-comfy';
import { fetchBackgroundImage } from '@/lib/ai-video/images';
import { renderAiVideo, type Ratio, type RenderSegment } from '@/lib/ai-video/render';
import {
  needsRender, dependentsOfSceneInput,
  type BlockStatus, type BlockKind, type SceneInput,
} from '@/lib/composer/dependency-graph';

const PUBLIC = process.cwd() + '/public';

// ============================ TYPES ============================
export interface Block {
  status: BlockStatus;        // draft | rendered | modified | error
  url: string | null;         // web url de l'asset (/uploads/...) ; null si pas généré
  error?: string | null;
  updated_at?: number;
}
export interface ProjectScene {
  id: string;
  // --- INPUTS éditables ---
  script: string;             // narration → voix + sous-titres + lip-sync
  caption: string;            // sous-titre incrusté
  visual_prompt: string;      // mots-clés EN pour l'image
  image_override: string | null; // image attachée par l'user (prioritaire)
  // --- BLOCS générés (cache par statut) ---
  voice: Block;
  image: Block;
  avatar: Block;              // pour avatar_video (branché plus tard via /avatar)
  subtitle: Block;
  motion: Block;              // clip vivant (image animée I2V) — OPT-IN « Donner vie », réinjecté au montage
}
export interface ComposerProjectData {
  title: string;
  intent: ContentType;
  format: RenderFormat;
  ratio: Ratio;
  ton: string;
  cta: string;
  hashtags: string[];
  text: string;               // corps éditable pour text_post
  presenter: boolean;         // avatar_settings (global)
  voiceover: boolean;         // voix on/off (global)
  scenes: ProjectScene[];
  music: Block;               // bloc global
  draft_url: string | null;   // dernier rendu brouillon (vidéo) ou image finale
  poster_url: string | null;
}
export interface ComposerProject extends ComposerProjectData {
  id: string;
  user_id: string;
  request: string;
  status: BlockStatus;        // statut global du projet
  published_card_id: string | null;
  created_at: number;
  updated_at: number;
}

// ============================ TABLE ============================
let ensured = false;
function ensureTable() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS composer_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      request TEXT,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      data TEXT NOT NULL,
      published_card_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_composer_projects_user ON composer_projects(user_id, updated_at DESC);
  `);
  ensured = true;
}

function block(): Block { return { status: 'draft', url: null }; }

function rowToProject(row: any): ComposerProject {
  const data = JSON.parse(row.data) as ComposerProjectData;
  // Backfill : projets créés avant le bloc `motion` (Pascal 2026-06-18).
  for (const s of data.scenes || []) { if (!(s as any).motion) (s as any).motion = block(); }
  return {
    id: row.id, user_id: row.user_id, request: row.request,
    status: row.status, published_card_id: row.published_card_id,
    created_at: row.created_at, updated_at: row.updated_at,
    ...data,
  };
}

function persist(p: ComposerProject) {
  ensureTable();
  const { id, user_id, request, status, published_card_id, created_at, updated_at, ...data } = p;
  getDb().prepare(
    `UPDATE composer_projects SET request=?, title=?, status=?, data=?, published_card_id=?, updated_at=? WHERE id=?`
  ).run(request, p.title, status, JSON.stringify(data), published_card_id ?? null, updated_at, id);
}

// ============================ CRÉATION ============================
/** Crée un projet éditable : plan complet, tout en `draft`, AUCUNE génération encore. */
export async function createProject(
  userId: string, request: string, opts?: { voiceover?: boolean; presenter?: boolean }
): Promise<ComposerProject> {
  ensureTable();
  const req = (request || '').trim();
  const intent = await routeIntent(req);
  const sc = await buildScenario(req, intent);
  const format = selectFormat(intent);

  const scenes: ProjectScene[] = sc.scenes.map((s) => ({
    id: randomUUID(),
    script: s.narration,
    caption: s.caption,
    visual_prompt: s.visual,
    image_override: null,
    voice: block(), image: block(), avatar: block(), subtitle: block(), motion: block(),
  }));

  const now = Date.now();
  const data: ComposerProjectData = {
    title: sc.title, intent, format, ratio: sc.ratio, ton: sc.ton, cta: sc.cta,
    hashtags: sc.hashtags, text: sc.text, presenter: opts?.presenter ?? (intent === 'avatar'),
    voiceover: opts?.voiceover !== false, scenes, music: block(),
    draft_url: null, poster_url: null,
  };
  const id = randomUUID();
  getDb().prepare(
    `INSERT INTO composer_projects (id, user_id, request, title, status, data, published_card_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?)`
  ).run(id, userId, req, sc.title, JSON.stringify(data), now, now);

  return { id, user_id: userId, request: req, status: 'draft', published_card_id: null, created_at: now, updated_at: now, ...data };
}

// ============================ LECTURE ============================
export function getProject(id: string, userId: string): ComposerProject | null {
  ensureTable();
  const row = getDb().prepare('SELECT * FROM composer_projects WHERE id=? AND user_id=?').get(id, userId);
  return row ? rowToProject(row) : null;
}
export function listProjects(userId: string, limit = 30): ComposerProject[] {
  ensureTable();
  const rows = getDb().prepare('SELECT * FROM composer_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').all(userId, limit) as any[];
  return rows.map(rowToProject);
}
export function deleteProject(id: string, userId: string): boolean {
  ensureTable();
  const r = getDb().prepare('DELETE FROM composer_projects WHERE id=? AND user_id=?').run(id, userId);
  return r.changes > 0;
}

// ============================ ÉDITION + INVALIDATION ============================
function invalidate(scene: ProjectScene, kinds: BlockKind[]) {
  for (const k of kinds) {
    if (k === 'music') continue; // global, traité ailleurs
    const b = (scene as any)[k] as Block | undefined;
    if (b && b.status !== 'draft') { b.status = 'modified'; b.url = null; b.error = null; }
  }
}

/** Édite UNE scène. Toute clé d'input changée invalide ses blocs dépendants (cache partiel). */
export function updateScene(
  id: string, userId: string,
  sceneId: string, patch: Partial<Pick<ProjectScene, 'script' | 'caption' | 'visual_prompt' | 'image_override'>>
): ComposerProject | null {
  const p = getProject(id, userId);
  if (!p) return null;
  const scene = p.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  const changed: SceneInput[] = [];
  if (patch.script !== undefined && patch.script !== scene.script) { scene.script = String(patch.script).slice(0, 600); changed.push('script'); }
  if (patch.caption !== undefined && patch.caption !== scene.caption) { scene.caption = String(patch.caption).slice(0, 80); }
  if (patch.visual_prompt !== undefined && patch.visual_prompt !== scene.visual_prompt) { scene.visual_prompt = String(patch.visual_prompt).slice(0, 120); changed.push('visual_prompt'); }
  if (patch.image_override !== undefined && patch.image_override !== scene.image_override) { scene.image_override = patch.image_override ? String(patch.image_override) : null; changed.push('image_override'); }

  // caption seul (sous-titre) → invalide le sous-titre de la scène
  if (patch.caption !== undefined && scene.subtitle.status !== 'draft') { scene.subtitle.status = 'modified'; }

  for (const inp of changed) invalidate(scene, dependentsOfSceneInput(inp));

  p.status = 'modified';
  p.updated_at = Date.now();
  persist(p);
  return p;
}

/** Édite des champs globaux (texte/ton/cta/hashtags + toggles voix/avatar) → invalidation globale. */
export function updateGlobal(
  id: string, userId: string,
  patch: Partial<Pick<ComposerProjectData, 'text' | 'ton' | 'cta' | 'hashtags' | 'title' | 'voiceover' | 'presenter'>>
): ComposerProject | null {
  const p = getProject(id, userId);
  if (!p) return null;

  if (patch.title !== undefined) p.title = String(patch.title).slice(0, 140);
  if (patch.text !== undefined) p.text = String(patch.text).slice(0, 4000);
  if (patch.ton !== undefined) p.ton = String(patch.ton).slice(0, 40);
  if (patch.cta !== undefined) p.cta = String(patch.cta).slice(0, 120);
  if (patch.hashtags !== undefined) p.hashtags = (patch.hashtags || []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8);

  if (patch.voiceover !== undefined && patch.voiceover !== p.voiceover) {
    p.voiceover = !!patch.voiceover;            // toggle voix → invalide toutes les voix (+ avatar lip-sync)
    for (const s of p.scenes) invalidate(s, ['voice', 'avatar']);
  }
  if (patch.presenter !== undefined && patch.presenter !== p.presenter) {
    p.presenter = !!patch.presenter;            // avatar_settings global → invalide tous les avatars
    for (const s of p.scenes) invalidate(s, ['avatar']);
  }

  p.status = 'modified';
  p.updated_at = Date.now();
  persist(p);
  return p;
}

/**
 * Force la régénération de blocs d'UNE scène (bouton « Régénérer cette scène »).
 * Sans `kinds` → toute la scène. Sinon ['image'] (juste l'image), ['voice','avatar'] (relire), etc.
 * Marque les blocs `modified` ; le prochain renderProject les refait (et eux seuls).
 */
export function markSceneForRegen(id: string, userId: string, sceneId: string, kinds?: BlockKind[]): ComposerProject | null {
  const p = getProject(id, userId);
  if (!p) return null;
  const scene = p.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  const targets: BlockKind[] = kinds && kinds.length ? kinds : ['image', 'voice', 'subtitle', 'avatar'];
  for (const k of targets) {
    if (k === 'music') continue;
    const b = (scene as any)[k] as Block | undefined;
    if (b) { b.status = 'modified'; if (k !== 'subtitle') b.url = null; b.error = null; }
  }
  p.status = 'modified';
  p.updated_at = Date.now();
  persist(p);
  return p;
}

// ============================ RENDU (partiel + assemblage) ============================
function webUrl(localOrWeb: string | null): string | null {
  if (!localOrWeb) return null;
  if (localOrWeb.startsWith('/uploads/') || localOrWeb.startsWith('/audio-lib/')) return localOrWeb;
  if (localOrWeb.startsWith(PUBLIC)) return localOrWeb.slice(PUBLIC.length);
  return null;
}
function localPath(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads/') || url.startsWith('/audio-lib/')) {
    const p = path.join(PUBLIC, url.replace(/^\//, ''));
    return existsSync(p) ? p : null;
  }
  if (url.startsWith(PUBLIC)) return existsSync(url) ? url : null;
  return null;
}

/** Régénère le bloc image d'une scène (override > SDXL > vraie photo). */
async function renderImageBlock(scene: ProjectScene, portrait: boolean, title: string): Promise<void> {
  try {
    let img: string | null = localPath(scene.image_override);
    if (!img && scene.image_override) img = scene.image_override; // url distante : laissée telle quelle
    if (!img) {
      const q = scene.visual_prompt || scene.caption || title;
      // 1) SDXL sur NOTRE GPU : image photoréaliste + style cohérent (Pascal 2026-06-19,
      //    remplace le stock aléatoire = croquis incohérents). Seed dérivé de l'id scène (reproductible).
      if (sdxlAvailable()) img = await sdxlSceneImage(q, portrait, motionSeed(scene.id, 0));
      // 2) worker GPU complet (si configuré)
      if (!img && gpuWorkerAvailable()) img = await gpuImage(`${q}, high detail, photorealistic`, portrait);
      // 3) repli : banque d'images stock (jamais de casse)
      if (!img) img = await fetchBackgroundImage(q) || await fetchBackgroundImage(title);
    }
    if (img) { scene.image.url = webUrl(img) || (img.startsWith('http') ? img : null); scene.image.status = 'rendered'; scene.image.error = null; }
    else { scene.image.status = 'error'; scene.image.error = 'no_image'; }
  } catch (e) { scene.image.status = 'error'; scene.image.error = (e as Error).message; }
  scene.image.updated_at = Date.now();
}

/** Visage Léa cohérent : généré UNE fois (SDXL), mis en cache sur un chemin stable. */
const LEA_FACE = path.join(PUBLIC, 'uploads', 'lea-face.png');
let leaFacePromise: Promise<string | null> | null = null;
async function getLeaFace(): Promise<string | null> {
  if (existsSync(LEA_FACE)) return LEA_FACE;
  if (!leaFacePromise) {
    leaFacePromise = (async () => {
      if (!gpuWorkerAvailable()) return null;
      const img = await gpuImage(
        'portrait photo of a friendly young woman TV presenter named Lea, soft studio lighting, neutral background, head and shoulders, looking straight at camera, photorealistic, high detail',
        true,
      );
      if (!img) return null;
      try { await copyFile(img, LEA_FACE); return LEA_FACE; } catch { return img; }
    })();
  }
  return leaFacePromise;
}

/** Régénère le bloc avatar (Léa parlante) d'une scène : visage Léa + voix → lip-sync GPU. */
async function renderAvatarBlock(scene: ProjectScene, portrait: boolean): Promise<void> {
  try {
    const voiceLocal = localPath(scene.voice.url);
    if (!voiceLocal) { scene.avatar.status = 'error'; scene.avatar.error = 'needs_voice'; return; }
    const face = await getLeaFace();
    if (!face) { scene.avatar.status = 'error'; scene.avatar.error = 'no_face'; return; }
    const clip = await gpuAvatar({ path: face }, voiceLocal, portrait);
    if (clip) { scene.avatar.url = webUrl(clip); scene.avatar.status = 'rendered'; scene.avatar.error = null; }
    else { scene.avatar.status = 'error'; scene.avatar.error = 'avatar_endpoint_unavailable'; } // /avatar pas déployé → repli montage
  } catch (e) { scene.avatar.status = 'error'; scene.avatar.error = (e as Error).message; }
  scene.avatar.updated_at = Date.now();
}

/** Régénère le bloc voix d'une scène (XTTS GPU). */
async function renderVoiceBlock(scene: ProjectScene, voiceover: boolean): Promise<void> {
  if (!voiceover) { scene.voice.status = 'rendered'; scene.voice.url = null; return; }
  try {
    // VOIX, ordre de priorité (Pascal 2026-06-18) : 1) XTTS CHEZ NOUS (service dédié XTTS_URL) ;
    // 2) worker complet GPU_WORKER_URL ; 3) edge-tts (filet gratuit). Chez nous d'abord.
    const v = (await gpuXtts(scene.script, 'fr'))
      || (gpuWorkerAvailable() ? await gpuTts(scene.script, 'fr') : null)
      || await synthesizeVoiceEdge(scene.script);
    if (v) { scene.voice.url = webUrl(v); scene.voice.status = 'rendered'; scene.voice.error = null; }
    else { scene.voice.status = 'error'; scene.voice.error = 'no_tts'; }
  } catch (e) { scene.voice.status = 'error'; scene.voice.error = (e as Error).message; }
  scene.voice.updated_at = Date.now();
}

/** Seed déterministe par (projet, index de scène) → cohérence/reproductibilité du clip. */
function motionSeed(projectId: string, idx: number): number {
  let h = 2166136261 >>> 0;
  const s = `${projectId}:${idx}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 1_000_000_000;
}

/**
 * Bloc MOTION (Pascal 2026-06-18) : anime l'image fixe de la scène en clip vidéo (I2V — préserve
 * l'image, donc l'histoire). OPT-IN (« Donner vie »), réinjecté dans le montage via videoPath.
 * Repli gracieux : si GPU absent → null → le montage retombe sur l'image fixe (zéro casse).
 */
async function renderMotionBlock(scene: ProjectScene, portrait: boolean, projectId: string, idx: number): Promise<void> {
  try {
    const src = localPath(scene.image.url) || localPath(scene.image_override);
    if (!src) { scene.motion.status = 'error'; scene.motion.error = 'needs_image'; scene.motion.updated_at = Date.now(); return; }
    const prompt = (scene.visual_prompt || scene.script || 'subtle natural motion, cinematic, photorealistic').slice(0, 300);
    const clip = await gpuMotion(src, prompt, portrait, motionSeed(projectId, idx));
    if (clip) { scene.motion.url = webUrl(clip); scene.motion.status = 'rendered'; scene.motion.error = null; }
    else { scene.motion.status = 'error'; scene.motion.error = 'motion_unavailable'; }
  } catch (e) { scene.motion.status = 'error'; scene.motion.error = (e as Error).message; }
  scene.motion.updated_at = Date.now();
}

/**
 * Rendu BROUILLON : ne régénère QUE les blocs `modified`/`draft`/`error` (cache).
 * Puis assemble selon le format. Renvoie le projet à jour (draft_url rempli si média).
 */
export async function renderProject(id: string, userId: string, opts?: { signal?: AbortSignal }): Promise<ComposerProject | null> {
  const p = getProject(id, userId);
  if (!p) return null;
  const portrait = p.ratio === '9:16';

  // text_post : pas de média, le texte EST le contenu
  if (p.format === 'text_post') {
    p.draft_url = null;
    p.status = 'rendered';
    p.updated_at = Date.now();
    persist(p);
    return p;
  }

  // 1) Régénération SÉLECTIVE des blocs nécessaires (cache par statut)
  for (let i = 0; i < p.scenes.length; i++) {
    const scene = p.scenes[i];
    if (needsRender(scene.image.status, !!scene.image.url)) await renderImageBlock(scene, portrait, p.title);
    if (p.format === 'montage_video' || p.format === 'avatar_video') {
      if (needsRender(scene.voice.status, !!scene.voice.url)) await renderVoiceBlock(scene, p.voiceover);
      // sous-titre : pas d'asset séparé (incrusté au montage) → suit le script
      scene.subtitle.status = 'rendered';
      // avatar Léa parlante : visage Léa + voix → lip-sync (si presenter activé)
      if (p.presenter && needsRender(scene.avatar.status, !!scene.avatar.url)) await renderAvatarBlock(scene, portrait);
      // MOTION (« Donner vie ») : OPT-IN strict → seulement si explicitement demandé (status 'modified'),
      // JAMAIS au rendu complet (sinon chaque Aperçu animerait tout = très lent). Pascal 2026-06-18.
      if (scene.motion && scene.motion.status === 'modified') await renderMotionBlock(scene, portrait, p.id, i);
    }
    if (opts?.signal?.aborted) return p;
  }

  // 2) Assemblage selon le format
  if (p.format === 'image' || p.format === 'carousel') {
    const first = p.scenes.find((s) => s.image.url);
    p.draft_url = first?.image.url ?? null;
    p.poster_url = p.draft_url;
  } else {
    // montage_video / avatar_video : si Léa parlante dispo → clip avatar prioritaire,
    // sinon repli montage image+voix (jamais de casse).
    const segments: RenderSegment[] = p.scenes.map((s) => {
      // Priorité : clip MOTION (« Donner vie », image animée) > avatar Léa > image fixe.
      const motionClip = localPath(s.motion?.url);
      const avatarClip = p.presenter ? localPath(s.avatar.url) : null;
      const clip = motionClip || avatarClip;
      return {
        caption: s.caption,
        videoPath: clip,                                 // plan vivant (motion ou avatar)
        imagePath: clip ? null : localPath(s.image.url), // sinon image fixe de fond
        voicePath: localPath(s.voice.url),               // audio
      };
    });
    try {
      const out = await renderAiVideo({ segments, ratio: p.ratio, musicPath: localPath(p.music.url), transition: 'fade', signal: opts?.signal });
      p.draft_url = out.url;
      p.poster_url = out.posterUrl;
    } catch (e) {
      p.status = 'error';
      p.updated_at = Date.now();
      persist(p);
      throw e;
    }
  }

  p.status = 'rendered';
  p.updated_at = Date.now();
  persist(p);
  return p;
}

// ============================ PUBLICATION ============================
/** Publie le projet rendu dans le feed (card). */
export function publishProject(id: string, userId: string): { cardId: string } | null {
  const p = getProject(id, userId);
  if (!p) return null;
  const tags = p.hashtags.length ? ' ' + p.hashtags.map((h) => '#' + h).join(' ') : '';
  const caption = ([p.title, p.cta].filter(Boolean).join(' — ') + tags).slice(0, 280);

  let card;
  if (p.format === 'text_post') {
    card = createDirectCard(userId, { type: 'texte', text: p.text || p.scenes.map((s) => s.script).join('\n\n') || p.title, caption });
  } else if (p.format === 'image' || p.format === 'carousel') {
    card = createDirectCard(userId, { type: 'image', media_url: p.draft_url, caption });
  } else {
    card = createDirectCard(userId, { type: 'video', media_url: p.draft_url, caption });
  }

  p.published_card_id = card.id;
  p.updated_at = Date.now();
  persist(p);
  return { cardId: card.id };
}
