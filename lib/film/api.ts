/**
 * lib/film/api.ts — CLIENT partagé du parcours FILM en projet (web).
 *
 * Le parcours web est découpé en 5 écrans (miroir EXACT du natif, Pascal 2026-09-10) :
 *   Mes films → Écriture guidée → Storyboard → Tournage guidé → Montage.
 * Chaque écran est une page à part (comme les Navigator.push natifs). Ce module centralise les
 * appels aux endpoints `/api/project/*` + la reconstruction d'état depuis la `.card` (source de vérité)
 * pour qu'aucune page ne réinvente la logique. Aucune vue ici : que des fonctions + types.
 */

export interface FilmTake { id: string; media_url?: string; status?: string; recorded_at?: number; orientationScore?: number; by_ref?: string }
/** Montage multicam manuel (cross-fader) enregistré sur un plan. */
export interface FilmMulticamSegment { takeId: string; fromSec: number; toSec: number }
export interface FilmShot {
  id: string; intention?: string; cameraRole?: string; framingGuide?: string; placement?: string;
  storyboardImage?: string; cam?: number; pass?: number;
  targetCameraPose?: { yaw: number; pitch: number; roll: number };
  takes?: FilmTake[]; selectedTakeId?: string;
  multicamEdit?: { segments: FilmMulticamSegment[]; updated_at?: number };
}
export interface FilmScene { id: string; title?: string; location?: string; summary?: string; action?: string; dialogue?: string; shots?: FilmShot[] }
/** STUDIO : un bloc de la table de montage. transitionIn = transition depuis le bloc précédent.
 *  kind 'clip' = plan filmé ; kind 'card' (Couche 2) = carton de générique (titre/carton/crédits). */
export interface FilmStudioClip { media_url: string; fromSec: number; toSec: number }
export interface FilmTextCard { role?: 'title' | 'credits' | 'carton'; title: string; subtitle?: string; durationSec: number; bg?: string }
/** Couche 3 : redoublage d'un plan + bande sonore film. */
export interface FilmClipAudio { url: string; mode: 'replace' | 'mix'; volume: number }
export interface FilmSoundtrack { url: string; musicVolume: number; originalVolume: number }
export interface FilmStudioItem { id: string; kind: 'clip' | 'card'; sceneId: string; shotId: string; clips: FilmStudioClip[]; transitionIn: 'cut' | 'fade'; card?: FilmTextCard; audio?: FilmClipAudio }
export interface FilmStep { step: string; text: string }

export interface FilmState {
  title: string;
  lifecycle?: string;
  steps: FilmStep[];          // étapes créatives déjà écrites (logline → synopsis → treatment → screenplay)
  nextStep: string | null;    // prochaine étape à générer (null = scénario complet)
  screenplayOk: boolean;      // scénario validé
  breakdownOk: boolean;       // découpage validé
  scenes: FilmScene[];        // scènes + plans (+ takes)
  versions: { id: string; media_url?: string; coverage?: number }[]; // versions montées
}

const STEP_ORDER = ['logline', 'synopsis', 'treatment', 'screenplay'];

export const STEP_FR: Record<string, string> = { logline: 'la logline', synopsis: 'le synopsis', treatment: 'le traitement', screenplay: 'le scénario' };
export const STEP_TITLE: Record<string, string> = { logline: 'Logline', synopsis: 'Synopsis', treatment: 'Treatment', screenplay: 'Scénario' };

type ProjectCard = {
  title?: string;
  owner?: string;
  lifecycle?: string;
  project?: {
    lifecycle?: string;
    film?: {
      creativeDevelopment?: Record<string, string>;
      scenes?: FilmScene[];
      versions?: { id: string; media_url?: string; coverage?: number }[];
    };
    approvals?: { stage: string; state: string }[];
  };
};

/** Reconstruit tout l'état d'un film depuis sa `.card` (source unique). */
export function rebuildFromCard(card: ProjectCard): FilmState {
  const film = card?.project?.film || {};
  const cd = film.creativeDevelopment || {};
  const steps = STEP_ORDER.filter((k) => cd[k]).map((k) => ({ step: k, text: cd[k] }));
  const nextStep = STEP_ORDER.find((k) => !cd[k]) || null;
  const appr = (card?.project?.approvals || []).filter((a) => a.state === 'approved' || a.state === 'locked').map((a) => a.stage);
  return {
    title: card?.title || 'Film sans titre',
    lifecycle: card?.project?.lifecycle || card?.lifecycle,
    steps,
    nextStep,
    screenplayOk: appr.includes('screenplay'),
    breakdownOk: appr.includes('breakdown'),
    scenes: film.scenes || [],
    versions: film.versions || [],
  };
}

/** Nombre de plans TOTAL et TOURNÉS (au moins une prise non rejetée) sur toutes les scènes. */
export function shotStats(scenes: FilmScene[]): { total: number; shot: number } {
  let total = 0, shot = 0;
  for (const sc of scenes) for (const sh of sc.shots || []) {
    total++;
    const takes = (sh.takes || []).filter((t) => t.status !== 'rejected' && t.media_url);
    if (takes.length > 0) shot++;
  }
  return { total, shot };
}

/** Prises valides (non rejetées) d'un plan. */
export function takesOf(shot: FilmShot): FilmTake[] {
  return (shot.takes || []).filter((t) => t.status !== 'rejected' && t.media_url);
}

/** Caméras d'un plan (multicam) = meilleure prise de CHAQUE caméra (`by_ref`), ordonnées par récence.
 *  Sert à l'éditeur cross-fader : une caméra = une vidéo calée. ≥2 = plan montable à la main. */
export function shotCameras(shot: FilmShot): FilmTake[] {
  const takes = takesOf(shot);
  if (!takes.length) return [];
  const byCam = new Map<string, FilmTake[]>();
  for (const t of takes) {
    const cam = t.by_ref || '__solo__';
    const arr = byCam.get(cam); if (arr) arr.push(t); else byCam.set(cam, [t]);
  }
  return Array.from(byCam.values())
    .map((ts) => [...ts].sort((a, b) => {
      const sa = a.orientationScore ?? -1, sb = b.orientationScore ?? -1;
      if (sb !== sa) return sb - sa;
      return (b.recorded_at ?? 0) - (a.recorded_at ?? 0);
    })[0])
    .sort((a, b) => (a.recorded_at ?? 0) - (b.recorded_at ?? 0));
}

async function j(r: Response) { const d = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, d }; }
const H = { 'content-type': 'application/json' };

export async function getProject(id: string): Promise<ProjectCard | null> {
  const r = await fetch(`/api/project/${id}?context=full`, { credentials: 'include', cache: 'no-store' });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return d?.card || null;
}

export const filmApi = {
  develop: (id: string, body: Record<string, unknown> = {}) =>
    fetch(`/api/project/${id}/develop`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify(body) }).then(j),
  approve: (id: string, stage: 'screenplay' | 'breakdown') =>
    fetch(`/api/project/${id}/approve`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ stage, state: 'approved' }) }).then(j),
  breakdown: (id: string) =>
    fetch(`/api/project/${id}/storyboard`, { method: 'POST', credentials: 'include', headers: H, body: '{}' }).then(j),
  genShots: (id: string, sceneId: string) =>
    fetch(`/api/project/${id}/storyboard`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ scene_id: sceneId }) }).then(j),
  reviseScene: (id: string, sceneId: string, instruction: string) =>
    fetch(`/api/project/${id}/storyboard`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ scene_id: sceneId, instruction }) }).then(j),
  genSketch: (id: string, sceneId: string, shotId: string) =>
    fetch(`/api/project/${id}/storyboard`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ scene_id: sceneId, shot_id: shotId, sketch: true }) }).then(j),
  montage: (id: string) =>
    fetch(`/api/project/${id}/montage`, { method: 'POST', credentials: 'include', headers: H, body: '{}' }).then(j),
  // STUDIO (Couche 1) : table de montage éditable au-dessus de l'auto-montage (Pascal 2026-09-12).
  studioTimeline: (id: string) =>
    fetch(`/api/project/${id}/studio`, { credentials: 'include', cache: 'no-store' }).then(j),
  // soundtrack : passer l'objet pour l'enregistrer, null pour l'effacer, undefined (omis) pour ne pas y toucher.
  studioSave: (id: string, items: FilmStudioItem[], soundtrack?: FilmSoundtrack | null) =>
    fetch(`/api/project/${id}/studio`, { method: 'POST', credentials: 'include', headers: H,
      body: JSON.stringify(soundtrack === undefined ? { items } : { items, soundtrack }) }).then(j),
  // Rendu de la timeline ÉDITÉE (au lieu de l'EDL auto) → nouvelle version mp4.
  montageStudio: (id: string) =>
    fetch(`/api/project/${id}/montage`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ studio: true }) }).then(j),
  // Télécharger = œuvre terminée → statut 🎬 Film (sur le même projet, pas de doublon). Pascal 2026-09-12.
  finalize: (id: string) =>
    fetch(`/api/project/${id}/finalize`, { method: 'POST', credentials: 'include', headers: H, body: '{}' }).then(j),
  // Ajouter une partie/chapitre : l'IA écrit la suite (append scénario) + découpe cette partie (append scènes) → statut idée. Pascal 2026-09-12.
  addChapter: (id: string, instruction: string) =>
    fetch(`/api/project/${id}/add-chapter`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ instruction }) }).then(j),
  // Montage multicam MANUEL (cross-fader) : enregistre la liste de bascules d'un plan (parité natif).
  multicamEdit: (id: string, sceneId: string, shotId: string, segments: FilmMulticamSegment[]) =>
    fetch(`/api/project/${id}/multicam`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ scene_id: sceneId, shot_id: shotId, segments }) }).then(j),
  // Rejoindre le projet comme contributeur (parité natif joinProject) — requis pour qu'une 2e caméra
  // (autre user) puisse déposer des prises. Le simple signal 'join' ne suffit pas (il ne crée pas le contributeur).
  join: (id: string, roles: string[] = ['camera']) =>
    fetch(`/api/project/${id}/join`, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({ roles }) }).then(j),
  // Producteur-IA : détecte les besoins (figurants, lieu, musique…) et ouvre les missions (parité natif resolveNeeds).
  resolveNeeds: (id: string) =>
    fetch(`/api/project/${id}/resolve-needs`, { method: 'POST', credentials: 'include', headers: H, body: '{}' }).then(j),
  remove: (id: string) =>
    fetch(`/api/project/${id}`, { method: 'DELETE', credentials: 'include' }).then(j),
};
