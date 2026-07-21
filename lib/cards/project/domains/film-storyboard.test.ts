/**
 * film-storyboard.test — VS2 : découpage scènes + plans (purs, parsing robuste).
 * Exécuter : npx tsx lib/cards/project/domains/film-storyboard.test.ts
 */
import {
  extractJsonArray, buildBreakdownPrompt, applyBreakdown,
  buildShotsPrompt, parseShots, applyShots, scenesOf, type StoryScene,
} from './film-storyboard';
import type { ProjectBlock } from '../../v2/types';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void { if (cond) ok++; else { ko++; console.log(`❌ ${msg}`); } }

const project: ProjectBlock = {
  domain: 'film',
  constraints: { locations: ['Antananarivo - ruelle'], people: 3, devices: 1 },
  film: { creativeDevelopment: { idea: 'Une journée dans la ruelle.', screenplay: 'SCÈNE 1 - RUELLE - JOUR\nUn enfant court.' } },
};

// ── 1) extractJsonArray tolère les fences et le bavardage ──
assert(extractJsonArray('```json\n[{"title":"A"}]\n```').length === 1, 'extrait JSON entre fences');
assert(extractJsonArray('Voici :\n[{"a":1},{"b":2}] merci').length === 2, 'extrait JSON dans du texte');
assert(extractJsonArray('pas de json ici').length === 0, 'pas de tableau → []');
assert(extractJsonArray('[cassé').length === 0, 'JSON invalide → []');

// ── 2) Breakdown : prompt boussolé + application ──
const bp = buildBreakdownPrompt(project);
assert(/SMARTPHONE/i.test(bp.system) && /PEU de lieux/i.test(bp.system), 'breakdown : boussole smartphone/peu de lieux');
assert(bp.user.includes('SCÈNE 1') || bp.user.includes('journée'), 'breakdown : scénario/idée injecté');
assert(bp.user.includes('Antananarivo'), 'breakdown : contrainte lieu injectée');

const film2 = applyBreakdown(project, [
  { title: 'La course', location: 'Ruelle', summary: 'Un enfant court.' },
  { title: 'Le secret', location: 'Ruelle', summary: 'Deux voisins chuchotent.' },
  'ignore-moi',
]);
const p2: ProjectBlock = { ...project, film: film2 };
assert(scenesOf(p2).length === 2, 'breakdown : 2 scènes (le non-objet ignoré)');
assert(scenesOf(p2)[0].id.startsWith('scene_1_'), 'breakdown : id déterministe scene_1_…');
assert((project.film as any).scenes === undefined, 'breakdown : NE MUTE PAS l\'original');
assert(scenesOf(p2)[0].title === 'La course', 'breakdown : titre conservé');

// ── 3) Shots : prompt + parsing (pose bornée) + application ciblée ──
const scene = scenesOf(p2)[0];
const sp = buildShotsPrompt(p2, scene);
assert(/chef opérateur/i.test(sp.system) && /INTERDIT/i.test(sp.system), 'shots : boussole (interdit grue/drone)');
assert(sp.user.includes('La course'), 'shots : scène ciblée injectée');

const shots = parseShots([
  { intention: 'Établir la ruelle', cameraRole: 'wide', framingGuide: 'sujet au tiers', durationMs: 4000, targetCameraPose: { yaw: 10, pitch: -5, roll: 0 } },
  { intention: 'Gros plan visage', cameraRole: 'closeup', targetCameraPose: { yaw: 500, pitch: 2, roll: 1 } }, // yaw hors borne
  { pasunplan: true },
], scene.id);
assert(shots.length === 3, 'shots : 3 entrées parsées');
assert(shots[0].id === `${scene.id}_shot_1`, 'shots : id déterministe');
assert(shots[0].targetCameraPose?.yaw === 10, 'shots : pose lue');
assert(shots[1].targetCameraPose?.yaw === 180, 'shots : yaw borné à ±180');
assert(shots[2].targetCameraPose === undefined, 'shots : pose absente si incomplète');
assert(shots[0].durationMs === 4000, 'shots : durée entière');

const film3 = applyShots(p2, scene.id, shots);
const p3: ProjectBlock = { ...p2, film: film3 };
assert(scenesOf(p3)[0].shots?.length === 3, 'applyShots : plans posés sur la bonne scène');
assert(scenesOf(p3)[1].shots === undefined, 'applyShots : autres scènes intactes');
assert(scenesOf(p2)[0].shots === undefined, 'applyShots : NE MUTE PAS l\'original');

console.log(`\nfilm-storyboard : ${ok}/${ok + ko} OK`);
process.exit(ko ? 1 : 0);
