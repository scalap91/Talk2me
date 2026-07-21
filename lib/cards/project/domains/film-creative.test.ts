/**
 * film-creative.test — VS1 : pipeline créatif film (gates + progression, purs).
 * Exécuter : npx tsx lib/cards/project/domains/film-creative.test.ts
 */
import {
  approvalState, isApproved, setApproval,
  canBreakdown, canStoryboard, canEnterShooting,
  creativeStage, creativeStageLabel,
  type FilmScene,
} from './film-creative';
import type { ProjectBlock } from '../../v2/types';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { ok++; } else { ko++; console.log(`❌ ${msg}`); }
}

const cd = (dev: Record<string, unknown>): ProjectBlock => ({ domain: 'film', film: { creativeDevelopment: dev } });

// ── 1) Approbations ──
const p0: ProjectBlock = { domain: 'film' };
assert(approvalState(p0, 'screenplay') === 'draft', 'défaut = draft');
assert(!isApproved(p0, 'screenplay'), 'draft non approuvé');

const appr = setApproval(p0, 'screenplay', 'approved', 'usr_opaque_1', 1000);
const p1: ProjectBlock = { ...p0, approvals: appr };
assert(isApproved(p1, 'screenplay'), 'screenplay approved');
assert((p0.approvals ?? []).length === 0, 'setApproval NE MUTE PAS l\'original');
assert(appr[0].by_ref === 'usr_opaque_1' && appr[0].at === 1000, 'by_ref opaque + at injecté');
// re-poser la même étape remplace (pas de doublon)
const appr2 = setApproval(p1, 'screenplay', 'locked', 'usr_opaque_1', 2000);
assert(appr2.filter((a) => a.stage === 'screenplay').length === 1, 'pas de doublon d\'étape');
assert(isApproved({ ...p1, approvals: appr2 }, 'screenplay'), 'locked = approuvé aussi');

// ── 2) Gates ──
assert(!canBreakdown(p0), 'découpage bloqué sans scénario');
assert(canBreakdown(p1), 'découpage ouvert scénario validé');
assert(!canStoryboard(p1), 'storyboard bloqué sans découpage');
const p2: ProjectBlock = { ...p1, approvals: setApproval(p1, 'breakdown', 'approved', 'u', 3000) };
assert(canStoryboard(p2), 'storyboard ouvert scénario+découpage validés');

// ── 3) canEnterShooting ──
const sceneKO: FilmScene = { id: 's1', shots: [{ id: 'p1' }] }; // pas de cameraRole/framing
const r1 = canEnterShooting(p2, sceneKO);
assert(!r1.ok, 'tournage bloqué (storyboard non validé + plan incomplet)');
assert(r1.missing.some((m) => m.includes('storyboard')), 'manque storyboard listé');
assert(r1.missing.some((m) => m.includes('rôle caméra')), 'manque rôle caméra listé');

const p3: ProjectBlock = { ...p2, approvals: setApproval(p2, 'storyboard', 'locked', 'u', 4000) };
const sceneOK: FilmScene = { id: 's1', constraintsResolved: true, shots: [{ id: 'p1', cameraRole: 'wide', framingGuide: 'tiers gauche' }] };
const r2 = canEnterShooting(p3, sceneOK);
assert(r2.ok, `tournage autorisé quand tout est prêt (missing: ${r2.missing.join(', ')})`);
const r3 = canEnterShooting(p3, { id: 's2', constraintsResolved: false, shots: [{ id: 'p1', cameraRole: 'wide', framingGuide: 'x' }] });
assert(!r3.ok && r3.missing.some((m) => m.includes('contraintes')), 'contraintes non résolues bloquent');

// ── 4) Progression créative dérivée ──
assert(creativeStage(cd({})) === 'idea', 'stage idea');
assert(creativeStage(cd({ logline: 'x' })) === 'logline', 'stage logline');
assert(creativeStage(cd({ synopsis: 'x' })) === 'synopsis', 'stage synopsis');
assert(creativeStage(cd({ treatment: 'x' })) === 'treatment', 'stage treatment');
assert(creativeStage(cd({ screenplay: 'x' })) === 'screenplay', 'stage screenplay (à valider)');
assert(creativeStage(p1) === 'breakdown', 'stage breakdown (scénario validé)');
assert(creativeStage(p2) === 'storyboard', 'stage storyboard');
assert(creativeStage(p3) === 'ready_to_shoot', 'stage ready_to_shoot');
assert(creativeStageLabel(p3) === 'Prêt à tourner', 'label lisible');

console.log(`\nfilm-creative : ${ok}/${ok + ko} OK`);
process.exit(ko ? 1 : 0);
