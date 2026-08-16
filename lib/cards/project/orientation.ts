/**
 * lib/cards/project/orientation — ORIENTATION CAMÉRA (VS3), PURE.
 *
 * Port fidèle du package `t2m_filmage_augmente_card/web/engine/cameraOrientationMatcher.ts` (spec
 * figée « Orientation caméra »). Compare l'orientation RÉELLE du téléphone (yaw/pitch/roll, lue des
 * capteurs côté client) à la pose CIBLE du plan (`shot.targetCameraPose`) et produit :
 *   - un score 0–1 (pondéré yaw 0.45 · pitch 0.35 · roll 0.20) ;
 *   - `aligned` (les 3 axes dans leur tolérance : par défaut 5°/5°/3°) ;
 *   - un GUIDAGE lisible pour un débutant (« Tourne à droite 3° », « Relève le téléphone 2° »…).
 *
 * PUR : aucune I/O, aucun capteur ici (le client lit les capteurs et appelle ces fonctions). Le
 * score de cadrage FINAL (combinant vision, acteurs, FOV, stabilité) se calcule ailleurs (serveur/
 * mesh) — ici, seulement l'axe ORIENTATION.
 */

export interface CameraOrientation { yawDeg: number; pitchDeg: number; rollDeg: number }
export interface TargetCameraPose extends CameraOrientation {
  tolerance?: { yawDeg?: number; pitchDeg?: number; rollDeg?: number };
}
export interface OrientationMatch {
  score: number;                                  // 0–1
  aligned: boolean;
  errors: { yawDeg: number; pitchDeg: number; rollDeg: number };
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
/** Distance angulaire absolue en tenant compte du wrap 360°. */
function angularDistance(a: number, b: number): number {
  const diff = ((a - b + 180) % 360) - 180;
  return Math.abs(diff);
}
/** Score d'un axe : 1 si parfait, décroît, 0 au-delà de 3× la tolérance. */
function axisScore(error: number, tolerance: number): number {
  if (tolerance <= 0) return error === 0 ? 1 : 0;
  return clamp(1 - error / (tolerance * 3), 0, 1);
}

/** Compare l'orientation courante à la cible (mêmes poids/tolérances que le package figé). */
export function compareCameraOrientation(current: CameraOrientation, target: TargetCameraPose): OrientationMatch {
  const yawTol = target.tolerance?.yawDeg ?? 5;
  const pitchTol = target.tolerance?.pitchDeg ?? 5;
  const rollTol = target.tolerance?.rollDeg ?? 3;

  const yawErr = angularDistance(current.yawDeg, target.yawDeg);
  const pitchErr = Math.abs(current.pitchDeg - target.pitchDeg);
  const rollErr = angularDistance(current.rollDeg, target.rollDeg);

  const score = axisScore(yawErr, yawTol) * 0.45 + axisScore(pitchErr, pitchTol) * 0.35 + axisScore(rollErr, rollTol) * 0.20;
  return {
    score: clamp(score, 0, 1),
    aligned: yawErr <= yawTol && pitchErr <= pitchTol && rollErr <= rollTol,
    errors: { yawDeg: yawErr, pitchDeg: pitchErr, rollDeg: rollErr },
  };
}

// ── Guidage humain (« tourne à droite 3° ») ──────────────────────────────────

export interface OrientationGuidance { aligned: boolean; score: number; hints: string[] }

/**
 * Traduit l'écart en consignes lisibles. `signed = current − target` par axe donne le SENS :
 *  - yaw  > 0 : le tél pointe trop à droite → « Tourne à gauche » (et inversement) ;
 *  - pitch> 0 (tél trop haut/relevé)        → « Baisse le téléphone » ;
 *  - roll > 0 (penché à droite)             → « Redresse (incline à gauche) ».
 * Seuls les axes HORS tolérance sont mentionnés. Aligné → « ✓ Cadrage aligné ».
 */
export function orientationGuidance(current: CameraOrientation, target: TargetCameraPose): OrientationGuidance {
  const m = compareCameraOrientation(current, target);
  if (m.aligned) return { aligned: true, score: m.score, hints: ['✓ Cadrage aligné'] };

  const yawTol = target.tolerance?.yawDeg ?? 5;
  const pitchTol = target.tolerance?.pitchDeg ?? 5;
  const rollTol = target.tolerance?.rollDeg ?? 3;
  const hints: string[] = [];
  const round = (x: number) => Math.max(1, Math.round(x));

  // yaw : signe via la différence enroulée
  const yawSigned = ((current.yawDeg - target.yawDeg + 540) % 360) - 180;
  if (Math.abs(yawSigned) > yawTol) hints.push(`Tourne ${yawSigned > 0 ? 'à gauche' : 'à droite'} ${round(m.errors.yawDeg)}°`);

  const pitchSigned = current.pitchDeg - target.pitchDeg;
  if (Math.abs(pitchSigned) > pitchTol) hints.push(`${pitchSigned > 0 ? 'Baisse' : 'Relève'} le téléphone ${round(m.errors.pitchDeg)}°`);

  const rollSigned = ((current.rollDeg - target.rollDeg + 540) % 360) - 180;
  if (Math.abs(rollSigned) > rollTol) hints.push(`Redresse ${round(m.errors.rollDeg)}° (incline ${rollSigned > 0 ? 'à gauche' : 'à droite'})`);

  return { aligned: false, score: m.score, hints: hints.length ? hints : ['Ajuste le cadrage'] };
}

// ── Cohérence d'orientation paysage/portrait du PROJET (VS3+) ─────────────────
//
// Un film se tourne dans UNE orientation (paysage OU portrait). On déduit le mode d'une prise de son
// roll, on fixe le mode du PROJET sur la PREMIÈRE prise tournée, et on avertit (sans bloquer) si la
// prise en cours change d'orientation. Logique PURE, IDENTIQUE au natif — ne pas dévier.

export type OrientationMode = 'landscape' | 'portrait';

const fr = (m: OrientationMode): string => (m === 'landscape' ? 'paysage' : 'portrait');

/**
 * Déduit le mode (paysage/portrait) à partir du roll (degrés). Normalise dans [-180,180] puis :
 * téléphone couché sur un côté (|roll| ~ 90°) → paysage, sinon (droit ou tête en bas) → portrait.
 */
export function modeFromRoll(rollDeg: number): OrientationMode {
  const r = (((rollDeg + 180) % 360) + 360) % 360 - 180;
  return Math.abs(r) >= 45 && Math.abs(r) <= 135 ? 'landscape' : 'portrait';
}

/**
 * Mode d'orientation du PROJET : celui de la PLUS ANCIENNE prise (par `recorded_at`) qui porte un
 * `orientation_mode`. Parcourt toutes les prises de toutes les scènes/plans. `null` si aucune.
 */
export function projectOrientationMode(
  project: { film?: { scenes?: Array<{ shots?: Array<{ takes?: Array<{ orientation_mode?: OrientationMode; recorded_at?: number }> }> }> } } | null | undefined,
): OrientationMode | null {
  const scenes = project?.film?.scenes;
  if (!Array.isArray(scenes)) return null;
  const marked: { mode: OrientationMode; at: number }[] = [];
  for (const sc of scenes) {
    for (const sh of sc?.shots ?? []) {
      for (const tk of sh?.takes ?? []) {
        if (tk && (tk.orientation_mode === 'landscape' || tk.orientation_mode === 'portrait')) {
          marked.push({ mode: tk.orientation_mode, at: typeof tk.recorded_at === 'number' ? tk.recorded_at : 0 });
        }
      }
    }
  }
  if (!marked.length) return null;
  marked.sort((a, b) => a.at - b.at);
  return marked[0].mode;
}

/**
 * Avertissement (non bloquant) si la prise en cours change l'orientation établie du projet.
 * Renvoie un texte lisible si les deux modes sont connus ET différents, sinon `null`.
 */
export function orientationWarning(projectMode: OrientationMode | null, currentMode: OrientationMode | null): string | null {
  if (!projectMode || !currentMode || projectMode === currentMode) return null;
  return `Ce projet a été tourné en ${fr(projectMode)} — le mode ${fr(currentMode)} est déconseillé pour cette prise.`;
}
