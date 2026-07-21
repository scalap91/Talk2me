/**
 * lib/cards/project/domains/film-creative — PIPELINE CRÉATIF du domaine « film » (VS1).
 *
 * Le storyboard n'apparaît JAMAIS d'une idée brute. On descend une chaîne validée par l'humain :
 *   idée → contraintes → logline → synopsis → traitement → scénario → [APPROBATION scénario]
 *   → découpage scènes → découpage plans → storyboard → [APPROBATION storyboard] → tournage.
 *
 * Philosophie (figée) : l'IA produit le meilleur film RÉALISABLE avec les moyens du créateur
 * (contraint par project.constraints), pas « le meilleur film possible ».
 *
 * PUR (browser-safe) : aucune I/O, aucun Date.now() (l'horodatage est INJECTÉ). Le sous-document
 * `creativeDevelopment` vit dans `project.film` (Record libre du domaine) ; les approbations vivent
 * au socle dans `project.approvals[]` (APPROVAL_STAGES/APPROVAL_STATES déjà canoniques). Le cœur
 * générique ne connaît RIEN de ce fichier — seul le domaine film s'en sert.
 */
import type { ProjectBlock, ProjectApproval } from '../../v2/types';

/** Sous-document créatif (dans project.film.creativeDevelopment). Tous les champs optionnels. */
export interface CreativeDevelopment {
  idea?: string;
  logline?: string;
  synopsis?: string;
  treatment?: string;
  screenplay?: string;          // scénario dialogué
  sceneBreakdown?: string[];    // titres/résumés de scènes
  storyboardStatus?: string;    // 'none' | 'generating' | 'ready'
}

/** Un plan minimal, tel que le storyboard le produit (dans project.film.scenes[].shots[]). */
export interface FilmShot {
  id?: string;
  cameraRole?: string;          // ex. 'wide', 'closeup', 'over-shoulder' — requis avant tournage
  framingGuide?: string;        // guide de cadrage textuel — requis avant tournage
}
export interface FilmScene {
  id?: string;
  title?: string;
  shots?: FilmShot[];
  constraintsResolved?: boolean; // les contraintes critiques sont résolues/acceptées
}

// ── Approbations (socle) ────────────────────────────────────────────────────
const APPROVED = new Set(['approved', 'locked']);

/** État d'une étape d'approbation ('draft' par défaut). Lecture pure de project.approvals[]. */
export function approvalState(project: ProjectBlock, stage: string): string {
  const a = (project.approvals ?? []).find((x) => x.stage === stage);
  return a?.state ?? 'draft';
}
/** L'étape est-elle validée (approved OU locked) ? */
export function isApproved(project: ProjectBlock, stage: string): boolean {
  return APPROVED.has(approvalState(project, stage));
}

/**
 * Pose/repose une approbation (pur) : renvoie un nouveau tableau approvals[] (jamais mutant).
 * `now` INJECTÉ (moteur pur). `by_ref` = id OPAQUE de l'approbateur (jamais de PII).
 */
export function setApproval(
  project: ProjectBlock,
  stage: string,
  state: string,
  byRef: string,
  now: number,
): ProjectApproval[] {
  const rest = (project.approvals ?? []).filter((x) => x.stage !== stage);
  return [...rest, { stage, state, by_ref: byRef, at: now }];
}

// ── Gates du pipeline (règles de blocage figées) ────────────────────────────

/** Découpage en scènes autorisé une fois le SCÉNARIO validé. */
export function canBreakdown(project: ProjectBlock): boolean {
  return isApproved(project, 'screenplay');
}
/** Génération du storyboard autorisée une fois scénario + découpage validés. */
export function canStoryboard(project: ProjectBlock): boolean {
  return isApproved(project, 'screenplay') && isApproved(project, 'breakdown');
}

/**
 * Une SCÈNE peut-elle passer au tournage ? Règle figée : scénario + découpage + storyboard validés,
 * ET chaque plan a un cameraRole + un guide de cadrage, ET les contraintes critiques sont résolues.
 * Renvoie {ok, missing[]} — jamais de tournage sur une base non validée.
 */
export function canEnterShooting(project: ProjectBlock, scene: FilmScene): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!isApproved(project, 'screenplay')) missing.push('scénario non validé');
  if (!isApproved(project, 'breakdown')) missing.push('découpage non validé');
  if (!isApproved(project, 'storyboard')) missing.push('storyboard non validé');
  const shots = Array.isArray(scene.shots) ? scene.shots : [];
  if (shots.length === 0) missing.push('aucun plan');
  shots.forEach((s, i) => {
    const n = s.id ?? `plan ${i + 1}`;
    if (!s.cameraRole || !s.cameraRole.trim()) missing.push(`${n} : rôle caméra manquant`);
    if (!s.framingGuide || !s.framingGuide.trim()) missing.push(`${n} : guide de cadrage manquant`);
  });
  if (scene.constraintsResolved === false) missing.push('contraintes critiques non résolues');
  return { ok: missing.length === 0, missing };
}

// ── Progression créative dérivée (pour deriveProgress / l'UI) ────────────────

export type CreativeStage =
  | 'idea' | 'logline' | 'synopsis' | 'treatment' | 'screenplay'
  | 'screenplay_approved' | 'breakdown' | 'storyboard' | 'ready_to_shoot';

/**
 * Étape créative courante, dérivée des FAITS (jamais stockée). Ordre = la chaîne obligatoire.
 * Sert deriveProgress (label lisible) et débloque l'UI étape par étape.
 */
export function creativeStage(project: ProjectBlock): CreativeStage {
  const cd = (project.film as { creativeDevelopment?: CreativeDevelopment } | undefined)?.creativeDevelopment ?? {};
  const has = (s?: string | string[]) => (Array.isArray(s) ? s.length > 0 : !!(s && s.trim()));
  if (canStoryboard(project) && isApproved(project, 'storyboard')) return 'ready_to_shoot';
  if (canStoryboard(project)) return 'storyboard';
  if (isApproved(project, 'screenplay')) return 'breakdown';
  if (has(cd.screenplay)) return 'screenplay';
  if (has(cd.treatment)) return 'treatment';
  if (has(cd.synopsis)) return 'synopsis';
  if (has(cd.logline)) return 'logline';
  return 'idea';
}

const STAGE_LABEL: Record<CreativeStage, string> = {
  idea: 'Idée', logline: 'Logline', synopsis: 'Synopsis', treatment: 'Traitement',
  screenplay: 'Scénario — à valider', screenplay_approved: 'Scénario validé',
  breakdown: 'Découpage en scènes', storyboard: 'Storyboard', ready_to_shoot: 'Prêt à tourner',
};
export function creativeStageLabel(project: ProjectBlock): string {
  return STAGE_LABEL[creativeStage(project)];
}
