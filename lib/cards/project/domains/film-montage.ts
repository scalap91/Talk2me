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

/** Meilleure prise d'un plan : score d'orientation le plus haut, sinon la plus récente. undefined si aucune. */
export function bestTake(shot: StoryShot): StoryTake | undefined {
  const takes = takesOf(shot).filter((t) => t.status !== 'rejected' && t.media_url);
  if (!takes.length) return undefined;
  return [...takes].sort((a, b) => {
    const sa = a.orientationScore ?? -1, sb = b.orientationScore ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.recorded_at ?? 0) - (a.recorded_at ?? 0);
  })[0];
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

export interface EdlEntry { sceneId: string; shotId: string; takeId: string; media_url: string }

/** Construit l'EDL : la suite ORDONNÉE (scènes → plans) des prises retenues (selectedTakeId). */
export function buildEDL(project: ProjectBlock): EdlEntry[] {
  const edl: EdlEntry[] = [];
  for (const sc of scenesOf(project)) {
    for (const sh of sc.shots ?? []) {
      const selId = selectedOf(sh);
      if (!selId) continue;
      const take = takesOf(sh).find((t) => t.id === selId);
      if (take?.media_url) edl.push({ sceneId: sc.id, shotId: sh.id, takeId: take.id, media_url: take.media_url });
    }
  }
  return edl;
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
