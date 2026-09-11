/**
 * lib/cards/project/domains/film-montage — MONTAGE (VS5), partie PURE.
 *
 * Le film se monte TOUT SEUL au fil des prises : pour chaque plan on garde la MEILLEURE prise
 * (score de cadrage/orientation, à défaut la plus récente), on construit une EDL (Edit Decision
 * List = suite ordonnée des prises retenues), et l'assemblage vidéo (ffmpeg, I/O) produit une
 * VERSION du film — régénérée à chaque nouvelle prise gardée (pré-montage consultable en continu).
 *
 * BOUSSOLE [[feedback_talk2me_democratiser_creation]] : montage AUTOMATIQUE depuis des prises
 * smartphone, pas une suite de montage à maîtriser. PUR : sélection + EDL déterministes (pas d'I/O,
 * pas de Date.now()). L'assemblage ffmpeg et l'écriture de la version vivent dans la route.
 */
import type { ProjectBlock } from '../../v2/types';
import type { StoryScene, StoryShot, StoryTake } from './film-storyboard';
import { scenesOf } from './film-storyboard';

function filmOf(project: ProjectBlock): Record<string, unknown> {
  return ((project.film as Record<string, unknown>) ?? {});
}
function takesOf(shot: StoryShot): StoryTake[] {
  const t = (shot as unknown as { takes?: StoryTake[] }).takes;
  return Array.isArray(t) ? t : [];
}
function selectedOf(shot: StoryShot): string | undefined {
  return (shot as unknown as { selectedTakeId?: string }).selectedTakeId;
}

/** Ordonne des prises : meilleur score d'abord, puis la plus récente. */
function byScoreThenRecent(a: StoryTake, b: StoryTake): number {
  const sa = a.orientationScore ?? -1, sb = b.orientationScore ?? -1;
  if (sb !== sa) return sb - sa;
  return (b.recorded_at ?? 0) - (a.recorded_at ?? 0);
}

/** Meilleure prise d'un plan : score d'orientation le plus haut, sinon la plus récente. undefined si aucune. */
export function bestTake(shot: StoryShot): StoryTake | undefined {
  const takes = takesOf(shot).filter((t) => t.status !== 'rejected' && t.media_url);
  if (!takes.length) return undefined;
  return [...takes].sort(byScoreThenRecent)[0];
}

/**
 * ANGLES d'un plan (multicam) = la MEILLEURE prise de CHAQUE caméra (`by_ref`). Une seule caméra
 * (ou prises sans `by_ref`) → un seul angle. Plusieurs caméras ayant filmé le plan → plusieurs angles,
 * que le montage fera ALTERNER (Pascal 2026-09-11 : « alterner les angles »). Ordre stable = par
 * horodatage croissant (le réalisateur, qui lance « Action », est généralement premier).
 */
export function shotAngles(shot: StoryShot): StoryTake[] {
  const takes = takesOf(shot).filter((t) => t.status !== 'rejected' && t.media_url);
  if (!takes.length) return [];
  const byCam = new Map<string, StoryTake[]>();
  for (const t of takes) {
    const cam = t.by_ref || '__solo__';
    const arr = byCam.get(cam);
    if (arr) arr.push(t); else byCam.set(cam, [t]);
  }
  return Array.from(byCam.values())
    .map((ts) => [...ts].sort(byScoreThenRecent)[0])
    .sort((a, b) => (a.recorded_at ?? 0) - (b.recorded_at ?? 0));
}

/**
 * Sélectionne la meilleure prise de CHAQUE plan (immutable) : pose `shot.selectedTakeId` + marque
 * la prise retenue `kept`. Renvoie le nouveau `film`. N'invente rien : un plan sans prise reste vide.
 */
export function selectBestTakes(project: ProjectBlock): Record<string, unknown> {
  const scenes = scenesOf(project);
  const next: StoryScene[] = scenes.map((sc) => ({
    ...sc,
    shots: (sc.shots ?? []).map((sh) => {
      const best = bestTake(sh);
      if (!best) return sh;
      const takes = takesOf(sh).map((t) => ({ ...t, status: t.id === best.id ? 'kept' : (t.status === 'kept' ? 'pending' : t.status) }));
      return { ...sh, takes, selectedTakeId: best.id } as StoryShot;
    }),
  }));
  return { ...filmOf(project), scenes: next };
}

/**
 * UNE bascule du cross-fader (montage multicam MANUEL, Pascal 2026-09-11) : « de `fromSec` à `toSec`,
 * montre la prise `takeId` ». La séquence des segments (ordonnés, contigus) = la décision de montage
 * faite à la main dans l'éditeur (2 vidéos calées + cross-fader à la DJ). Coupe FRANCHE (une image à la fois).
 */
export interface MulticamSegment { takeId: string; fromSec: number; toSec: number }
/** Liste de bascules enregistrée sur un plan par l'éditeur multicam. */
export interface MulticamEdit { segments: MulticamSegment[]; updated_at?: number }
function multicamEditOf(shot: StoryShot): MulticamEdit | undefined {
  const e = (shot as unknown as { multicamEdit?: MulticamEdit }).multicamEdit;
  return e && Array.isArray(e.segments) && e.segments.length ? e : undefined;
}

export interface EdlClip { media_url: string; fromSec: number; toSec: number }
export interface EdlEntry {
  sceneId: string; shotId: string; takeId: string; media_url: string;
  /** Montage multicam MANUEL : suite ordonnée de fenêtres (cross-fader) à assembler dans l'ordre.
   *  Absent = plan mono-prise, assemblé en un seul clip entier (comportement historique). */
  clips?: EdlClip[];
}

/**
 * Construit l'EDL : la suite ORDONNÉE (scènes → plans) des prises retenues.
 * Si un plan porte un MONTAGE MULTICAM manuel (`multicamEdit.segments`), l'entrée porte `clips`
 * = les fenêtres décidées au cross-fader (résolues take→media_url), à assembler telles quelles.
 * Sinon : une seule prise (selectedTakeId), clip entier (inchangé).
 */
export function buildEDL(project: ProjectBlock): EdlEntry[] {
  const edl: EdlEntry[] = [];
  for (const sc of scenesOf(project)) {
    for (const sh of sc.shots ?? []) {
      const takes = takesOf(sh);
      const manual = multicamEditOf(sh);
      if (manual) {
        // Résout chaque bascule vers son media_url ; ignore une bascule vide/cassée.
        const clips: EdlClip[] = [];
        for (const s of manual.segments) {
          const t = takes.find((x) => x.id === s.takeId);
          if (!t?.media_url) continue;
          const from = Math.max(0, Number(s.fromSec) || 0);
          const to = Number(s.toSec) || 0;
          if (to - from < 0.05) continue;
          clips.push({ media_url: t.media_url, fromSec: from, toSec: to });
        }
        if (clips.length) {
          edl.push({ sceneId: sc.id, shotId: sh.id, takeId: clips[0] ? (takes.find((x) => x.media_url === clips[0].media_url)?.id ?? '') : '', media_url: clips[0].media_url, clips });
          continue;
        }
        // liste vide/cassée → on retombe sur la meilleure prise (jamais de plan vide).
      }
      const selId = selectedOf(sh);
      if (!selId) continue;
      const take = takes.find((t) => t.id === selId);
      if (!take?.media_url) continue;
      edl.push({ sceneId: sc.id, shotId: sh.id, takeId: take.id, media_url: take.media_url });
    }
  }
  return edl;
}

/**
 * Enregistre (immutable) la liste de bascules du cross-fader sur un plan : `shot.multicamEdit`.
 * Valide que chaque segment pointe une prise existante et que les fenêtres sont croissantes non vides.
 * Renvoie le nouveau `film` (la route persiste). Segments vides/invalides ignorés.
 */
export function applyMulticamEdit(
  project: ProjectBlock, sceneId: string, shotId: string, segments: MulticamSegment[], now: number,
): Record<string, unknown> {
  const film = filmOf(project);
  const scenes = Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
  const next = scenes.map((sc) => {
    if (sc.id !== sceneId) return sc;
    return {
      ...sc,
      shots: (sc.shots ?? []).map((sh) => {
        if (sh.id !== shotId) return sh;
        const ids = new Set(takesOf(sh).map((t) => t.id));
        const clean = (Array.isArray(segments) ? segments : [])
          .map((s) => ({ takeId: String(s.takeId), fromSec: Math.max(0, Number(s.fromSec) || 0), toSec: Number(s.toSec) || 0 }))
          .filter((s) => ids.has(s.takeId) && s.toSec - s.fromSec >= 0.05)
          .sort((a, b) => a.fromSec - b.fromSec);
        const edit: MulticamEdit = { segments: clean, updated_at: now };
        return { ...sh, multicamEdit: edit } as StoryShot;
      }),
    };
  });
  return { ...film, scenes: next };
}

/** Couverture du montage : plans avec une prise retenue / total (pour la progression / l'UI). */
export function montageCoverage(project: ProjectBlock): { total: number; filled: number; ratio: number } {
  let total = 0, filled = 0;
  for (const sc of scenesOf(project)) for (const sh of sc.shots ?? []) { total++; if (selectedOf(sh)) filled++; }
  return { total, filled, ratio: total ? filled / total : 0 };
}

export interface FilmVersion { id: string; media_url: string; edl: EdlEntry[]; created_at: number; coverage: number }

/** Ajoute une VERSION assemblée (immutable). Id déterministe v1, v2… `now`/`media_url` INJECTÉS. */
export function applyVersion(project: ProjectBlock, mediaUrl: string, edl: EdlEntry[], now: number): { film: Record<string, unknown>; versionId: string } {
  const film = filmOf(project);
  const prev = Array.isArray(film.versions) ? (film.versions as FilmVersion[]) : [];
  const versionId = `v${prev.length + 1}`;
  const cov = montageCoverage(project).ratio;
  const version: FilmVersion = { id: versionId, media_url: mediaUrl, edl, created_at: now, coverage: cov };
  return { film: { ...film, versions: [...prev, version] }, versionId };
}
