/**
 * film-montage.test — VS5 : sélection meilleure prise + EDL + versions (purs).
 * Exécuter : npx tsx lib/cards/project/domains/film-montage.test.ts
 */
import { bestTake, selectBestTakes, buildEDL, montageCoverage, applyVersion } from './film-montage';
import { scenesOf } from './film-storyboard';
import type { ProjectBlock } from '../../v2/types';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void { if (cond) ok++; else { ko++; console.log(`❌ ${msg}`); } }

const project: ProjectBlock = {
  domain: 'film',
  film: {
    scenes: [
      { id: 'sc1', shots: [
        { id: 'sc1_shot_1', takes: [
          { id: 't1', media_url: '/u/a.mp4', orientationScore: 0.5, recorded_at: 10, status: 'pending' },
          { id: 't2', media_url: '/u/b.mp4', orientationScore: 0.9, recorded_at: 20, status: 'pending' },
          { id: 't3', media_url: '/u/c.mp4', orientationScore: 0.9, recorded_at: 30, status: 'rejected' },
        ] },
        { id: 'sc1_shot_2', takes: [] }, // pas de prise
      ] },
      { id: 'sc2', shots: [
        { id: 'sc2_shot_1', takes: [{ id: 'u1', media_url: '/u/d.mp4', recorded_at: 5, status: 'pending' }] },
      ] },
    ],
  } as unknown as ProjectBlock['film'],
};

// ── 1) bestTake : score prioritaire, rejected exclu ──
const b = bestTake(scenesOf(project)[0].shots![0]);
assert(b?.id === 't2', 'meilleure prise = score 0.9 non rejetée (t2, pas t3)');
assert(bestTake(scenesOf(project)[0].shots![1]) === undefined, 'pas de prise → undefined');

// ── 2) selectBestTakes : selectedTakeId + kept, immutable ──
const film = selectBestTakes(project);
const p2: ProjectBlock = { ...project, film };
const sh1 = scenesOf(p2)[0].shots![0] as { selectedTakeId?: string; takes?: { id: string; status?: string }[] };
assert(sh1.selectedTakeId === 't2', 'selectedTakeId = t2');
assert(sh1.takes?.find((t) => t.id === 't2')?.status === 'kept', 't2 marquée kept');
assert(sh1.takes?.find((t) => t.id === 't1')?.status === 'pending', 't1 reste pending');
assert((scenesOf(project)[0].shots![0] as { selectedTakeId?: string }).selectedTakeId === undefined, 'NE MUTE PAS l\'original');

// ── 3) EDL ordonnée ──
const edl = buildEDL(p2);
assert(edl.length === 2, 'EDL : 2 entrées (sc1_shot_1 + sc2_shot_1, le plan sans prise ignoré)');
assert(edl[0].media_url === '/u/b.mp4' && edl[1].media_url === '/u/d.mp4', 'EDL ordonnée scènes→plans');
assert(edl[0].shotId === 'sc1_shot_1', 'EDL : shotId correct');

// ── 4) Couverture ──
const cov = montageCoverage(p2);
assert(cov.total === 3 && cov.filled === 2, 'couverture 2/3 plans');

// ── 5) applyVersion : v1, v2 incrémental ──
const { film: fv1, versionId } = applyVersion(p2, '/u/cut1.mp4', edl, 1000);
assert(versionId === 'v1', 'première version v1');
const p3: ProjectBlock = { ...p2, film: fv1 };
const { versionId: v2 } = applyVersion(p3, '/u/cut2.mp4', edl, 2000);
assert(v2 === 'v2', 'version suivante v2');
assert(((fv1 as { versions?: unknown[] }).versions ?? []).length === 1, 'v1 stockée');

console.log(`\nfilm-montage : ${ok}/${ok + ko} OK`);
process.exit(ko ? 1 : 0);
