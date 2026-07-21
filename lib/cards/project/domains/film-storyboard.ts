/**
 * lib/cards/project/domains/film-storyboard — STORYBOARD du domaine film (VS2), partie PURE.
 *
 * Deux niveaux, générés SÉPARÉMENT (le film est LONG — un seul appel tronquerait) :
 *   1) DÉCOUPAGE : scénario approuvé → scenes[] (entêtes courts : titre/lieu/résumé). Tient en 1 appel
 *      même pour un long-métrage (les entêtes sont compacts).
 *   2) PLANS : chaque scène → shots[] (intention, cameraRole, framingGuide, targetCameraPose). UN appel
 *      PAR SCÈNE (borné, résilient : si un échoue on ne perd qu'une scène).
 *
 * BOUSSOLE [[feedback_talk2me_democratiser_creation]] : tout doit être FILMABLE AU SMARTPHONE
 * (peu de lieux = constraints.locations, à la main/trépied, pas de matériel pro). Long ≠ irréaliste :
 * beaucoup de scènes COURTES faisables. PUR : prompts déterministes + parsing + application immutable ;
 * l'appel LLM (I/O) vit dans la route. Ids DÉTERMINISTES (pas de randomUUID → pur, ré-exécutable).
 */
import type { ProjectBlock } from '../../v2/types';
import { constraintsSentence } from './film-producer';
import type { CreativeDevelopment } from './film-creative';
import type { ProducerPrompt } from './film-producer';

export interface StoryShot {
  id: string;
  intention?: string;
  cameraRole?: string;                 // wide | medium | closeup | over-shoulder | insert …
  framingGuide?: string;               // texte : « sujet au tiers gauche, à hauteur d'yeux »
  placement?: string;                  // OÙ se met ce cameraman (angle/position) — multicaméra
  durationMs?: number;
  targetCameraPose?: { yaw: number; pitch: number; roll: number; tolerance?: { yawDeg?: number; pitchDeg?: number; rollDeg?: number } };
  storyboardImage?: string;            // URL de l'esquisse (générée à part, VS2b) — jamais inline
  cam?: number;                        // n° de caméra (1..N) — assigné par planCameras
  pass?: number;                       // n° de passe (si moins de téléphones que d'angles)
}
export interface StoryScene {
  id: string;
  title?: string;
  location?: string;
  summary?: string;
  action?: string;              // ce qui se passe (didascalies) — affiché au tournage
  dialogue?: string;            // répliques clés — affiché sur le côté au tournage (prompteur)
  shots?: StoryShot[];
  constraintsResolved?: boolean;
}

function creative(project: ProjectBlock): CreativeDevelopment {
  return ((project.film as { creativeDevelopment?: CreativeDevelopment } | undefined)?.creativeDevelopment) ?? {};
}
function filmOf(project: ProjectBlock): Record<string, unknown> {
  return ((project.film as Record<string, unknown>) ?? {});
}
function slug(v: string): string {
  return (v ?? '').trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
}

/** Extrait le PREMIER tableau JSON d'une réponse LLM (tolère ```json … ``` et le bavardage). [] si KO. */
export function extractJsonArray(raw: string): unknown[] {
  if (!raw) return [];
  const a = raw.indexOf('['); const b = raw.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(raw.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

const str = (v: unknown, max = 2000): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clampDeg = (v: number): number => Math.max(-180, Math.min(180, v));

// ─────────────────────────── 1) DÉCOUPAGE EN SCÈNES ───────────────────────────

export function buildBreakdownPrompt(project: ProjectBlock): ProducerPrompt {
  const cd = creative(project);
  const system = [
    'Tu es le chef de plateau Talk2Me.',
    'Découpe le scénario en SCÈNES tournables avec un SMARTPHONE, sans équipe pro ni matériel spécialisé.',
    'REGROUPE pour utiliser PEU de lieux (ceux du créateur). Chaque scène doit être courte et filmable à la main ou sur trépied.',
    'Un long-métrage a beaucoup de scènes COURTES : ne raccourcis pas l\'histoire, mais garde chaque scène réalisable.',
    'Pour CHAQUE scène donne aussi "action" (ce qui se passe, didascalies) et "dialogue" (les répliques clés, format « PERSONNAGE : réplique » sur plusieurs lignes) — c\'est ce que l\'acteur lira au tournage.',
    'Réponds UNIQUEMENT par un tableau JSON, rien d\'autre : [{"title": "...", "location": "...", "summary": "...", "action": "...", "dialogue": "..."}].',
  ].join(' ');
  const user = [
    cd.screenplay ? `Scénario :\n${cd.screenplay}` : (cd.treatment ? `Traitement :\n${cd.treatment}` : `Idée : ${cd.idea ?? ''}`),
    `Moyens réels : ${constraintsSentence(project)}.`,
    'Donne la liste ORDONNÉE des scènes en JSON.',
  ].join('\n\n');
  return { system, user };
}

/** Applique un découpage : renvoie un `film` immuable avec scenes[] (ids déterministes scene_1…). */
export function applyBreakdown(project: ProjectBlock, rawScenes: unknown[]): Record<string, unknown> {
  const scenes: StoryScene[] = [];
  rawScenes.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const o = s as Record<string, unknown>;
    const title = str(o.title, 200);
    scenes.push({
      id: `scene_${i + 1}_${slug(title ?? String(i + 1))}`,
      ...(title ? { title } : {}),
      ...(str(o.location, 200) ? { location: str(o.location, 200) } : {}),
      ...(str(o.summary, 1000) ? { summary: str(o.summary, 1000) } : {}),
      ...(str(o.action, 2000) ? { action: str(o.action, 2000) } : {}),
      ...(str(o.dialogue, 4000) ? { dialogue: str(o.dialogue, 4000) } : {}),
    });
  });
  return { ...filmOf(project), scenes };
}

// ─────────────────────────── 2) DÉCOUPAGE EN PLANS (par scène) ───────────────────────────

export function buildShotsPrompt(project: ProjectBlock, scene: StoryScene): ProducerPrompt {
  const system = [
    'Tu es le chef opérateur Talk2Me.',
    'Découpe CETTE scène en PLANS filmables avec un SMARTPHONE tenu à la main ou sur trépied.',
    'INTERDIT : grue, travelling motorisé, drone (sauf si explicitement disponible), steadicam pro.',
    'Propose un DISPOSITIF MULTICAMÉRA : des ANGLES COMPLÉMENTAIRES qui couvrent la scène (ex. dialogue = 1 plan large « master » + 1 gros plan/contrechamp par personnage). Chaque plan = UNE caméra (un téléphone).',
    'Pour chaque plan donne : intention (1 phrase), cameraRole (wide|medium|closeup|over-shoulder|insert), placement (OÙ se met CE cameraman et QUI/QUOI il cadre — ex. « face à Faly, par-dessus l\'épaule de Naina »), framingGuide (cadrage concret pour un débutant), durationMs (entier), targetCameraPose {yaw,pitch,roll} en degrés (yaw=gauche/droite, pitch=haut/bas, roll=inclinaison).',
    'Réponds UNIQUEMENT par un tableau JSON : [{"intention":"...","cameraRole":"...","placement":"...","framingGuide":"...","durationMs":0,"targetCameraPose":{"yaw":0,"pitch":0,"roll":0}}].',
  ].join(' ');
  const user = [
    `Scène : ${scene.title ?? scene.id}${scene.location ? ` (lieu : ${scene.location})` : ''}.`,
    scene.summary ? `Résumé : ${scene.summary}` : '',
    `Moyens réels : ${constraintsSentence(project)}.`,
    'Donne les plans en JSON.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

// ─────────────────────────── 2b) ESQUISSE STORYBOARD (dessin SVG via DeepSeek) ───────────────────────────

/** Prompt d'un CROQUIS au trait (SVG) — DeepSeek génère du code, pas une photo (pas besoin de RunPod). */
export function buildSketchPrompt(scene: StoryScene, shot: StoryShot): ProducerPrompt {
  const system = [
    'Tu es storyboardeur.',
    'Dessine un CROQUIS AU TRAIT (style storyboard rapide, noir sur transparent) pour UN plan de film tourné au smartphone.',
    'Réponds UNIQUEMENT du code SVG valide, rien d\'autre (aucun texte hors du SVG, aucune balise ```).',
    'Contraintes SVG : <svg viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg">…</svg> ; trait noir #111, fill="none" (silhouettes simples au trait), fond transparent, pas de couleur.',
    'Représente le cadrage et la position du sujet dans le cadre (règle des tiers), pas de détails superflus.',
  ].join(' ');
  const user = [
    `Plan : ${shot.intention ?? shot.cameraRole ?? 'plan'}${shot.cameraRole ? ` (${shot.cameraRole})` : ''}.`,
    shot.framingGuide ? `Cadrage : ${shot.framingGuide}.` : '',
    scene.location ? `Lieu : ${scene.location}.` : '',
    'Donne le SVG.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

/** Extrait le bloc <svg>…</svg> d'une réponse LLM, borné. '' si absent/suspect. */
export function extractSvg(raw: string): string {
  if (!raw) return '';
  const a = raw.toLowerCase().indexOf('<svg');
  const b = raw.toLowerCase().lastIndexOf('</svg>');
  if (a < 0 || b <= a) return '';
  const svg = raw.slice(a, b + 6);
  if (svg.length > 40000) return '';                 // garde-fou taille
  if (/<script|onload=|href\s*=\s*["']?\s*javascript:/i.test(svg)) return ''; // anti-XSS basique
  return svg;
}

/** Parse + normalise des plans (targetCameraPose bornée). */
export function parseShots(raw: unknown[], sceneId: string): StoryShot[] {
  const out: StoryShot[] = [];
  raw.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const o = s as Record<string, unknown>;
    const pose = o.targetCameraPose && typeof o.targetCameraPose === 'object' ? o.targetCameraPose as Record<string, unknown> : null;
    const y = pose ? num(pose.yaw) : undefined, p = pose ? num(pose.pitch) : undefined, r = pose ? num(pose.roll) : undefined;
    out.push({
      id: `${sceneId}_shot_${i + 1}`,
      ...(str(o.intention, 500) ? { intention: str(o.intention, 500) } : {}),
      ...(str(o.cameraRole, 40) ? { cameraRole: str(o.cameraRole, 40) } : {}),
      ...(str(o.placement, 500) ? { placement: str(o.placement, 500) } : {}),
      ...(str(o.framingGuide, 500) ? { framingGuide: str(o.framingGuide, 500) } : {}),
      ...(num(o.durationMs) !== undefined ? { durationMs: Math.max(0, Math.round(num(o.durationMs)!)) } : {}),
      ...(y !== undefined && p !== undefined && r !== undefined
        ? { targetCameraPose: { yaw: clampDeg(y), pitch: clampDeg(p), roll: clampDeg(r) } } : {}),
    });
  });
  return out;
}

/** Applique les plans d'UNE scène : renvoie un `film` immuable (scène ciblée mise à jour). */
export function applyShots(project: ProjectBlock, sceneId: string, shots: StoryShot[]): Record<string, unknown> {
  const film = filmOf(project);
  const scenes = Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
  const next = scenes.map((sc) => (sc.id === sceneId ? { ...sc, shots } : sc));
  return { ...film, scenes: next };
}

/**
 * Répartit les ANGLES en caméras/passes selon le nombre de TÉLÉPHONES réels (immutable & pur).
 * L'IA propose N angles ; s'il y a assez de téléphones → tout en simultané (1 passe, cam 1..N) ;
 * sinon → plusieurs PASSES (on filme la scène plusieurs fois). Un créateur solo (1 tél) obtient
 * quand même du multicaméra : angle A à la passe 1, angle B à la passe 2… (le montage pioche).
 */
export function assignCameras(shots: StoryShot[], devices: number): StoryShot[] {
  const d = Math.max(1, Math.floor(devices) || 1);
  return shots.map((sh, i) => ({ ...sh, cam: (i % d) + 1, pass: Math.floor(i / d) + 1 }));
}

/** Résumé du dispositif : nb de caméras simultanées + nb de passes. */
export function cameraPlan(shots: StoryShot[]): { cams: number; passes: number } {
  const cams = shots.reduce((m, s) => Math.max(m, s.cam ?? 1), shots.length ? 1 : 0);
  const passes = shots.reduce((m, s) => Math.max(m, s.pass ?? 1), shots.length ? 1 : 0);
  return { cams, passes };
}

/** Liste des scènes (pour la route : itérer / cibler). */
export function scenesOf(project: ProjectBlock): StoryScene[] {
  const film = filmOf(project);
  return Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
}

// ─────────────────────────── 3) PRISES (VS4) — le tournage nourrit le plan ───────────────────────────

export interface StoryTake {
  id: string;
  media_url: string;                   // vidéo uploadée (URL, jamais inline)
  by_ref?: string;                     // id OPAQUE du cadreur (jamais de PII)
  recorded_at?: number;                // horodatage INJECTÉ
  orientation?: { yaw: number; pitch: number; roll: number }[]; // télémétrie capteurs (série)
  orientationScore?: number;           // 0–1, conformité au targetCameraPose (calculée ailleurs)
  status?: string;                     // pending | kept | rejected
}

/** Pose une image d'esquisse storyboard sur un plan (VS2b, immutable). */
export function applyShotSketch(project: ProjectBlock, sceneId: string, shotId: string, url: string): Record<string, unknown> {
  const film = filmOf(project);
  const scenes = Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
  const next = scenes.map((sc) => sc.id !== sceneId ? sc : {
    ...sc,
    shots: (sc.shots ?? []).map((sh) => (sh.id === shotId ? { ...sh, storyboardImage: url } : sh)),
  });
  return { ...film, scenes: next };
}

/**
 * Ajoute une PRISE à un plan (immutable). Id déterministe `<shotId>_take_<n>`. `now`/`byRef` INJECTÉS.
 * Renvoie { film, takeId } — la route persiste `film` et renvoie l'id de la prise.
 */
export function applyTake(
  project: ProjectBlock, sceneId: string, shotId: string,
  take: { media_url: string; byRef?: string; now: number; orientation?: { yaw: number; pitch: number; roll: number }[]; orientationScore?: number },
): { film: Record<string, unknown>; takeId: string } {
  const film = filmOf(project);
  const scenes = Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
  let takeId = '';
  const next = scenes.map((sc) => {
    if (sc.id !== sceneId) return sc;
    return {
      ...sc,
      shots: (sc.shots ?? []).map((sh) => {
        if (sh.id !== shotId) return sh;
        const shTakes = (sh as unknown as { takes?: StoryTake[] }).takes;
        const prev = Array.isArray(shTakes) ? shTakes : [];
        takeId = `${shotId}_take_${prev.length + 1}`;
        const t: StoryTake = {
          id: takeId, media_url: take.media_url, status: 'pending', recorded_at: take.now,
          ...(take.byRef ? { by_ref: take.byRef } : {}),
          ...(take.orientation && take.orientation.length ? { orientation: take.orientation.slice(0, 600) } : {}),
          ...(typeof take.orientationScore === 'number' ? { orientationScore: take.orientationScore } : {}),
        };
        return { ...sh, takes: [...prev, t] };
      }),
    };
  });
  return { film: { ...film, scenes: next }, takeId };
}
