/**
 * orientation.test — VS3 : algo d'orientation + guidage (purs).
 * Exécuter : npx tsx lib/cards/project/orientation.test.ts
 */
import { compareCameraOrientation, orientationGuidance } from './orientation';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void { if (cond) ok++; else { ko++; console.log(`❌ ${msg}`); } }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

const target = { yawDeg: 90, pitchDeg: -10, rollDeg: 0 };

// ── 1) Parfaitement aligné ──
const m0 = compareCameraOrientation({ yawDeg: 90, pitchDeg: -10, rollDeg: 0 }, target);
assert(m0.aligned && near(m0.score, 1), 'aligné parfait → score 1');
assert(orientationGuidance({ yawDeg: 90, pitchDeg: -10, rollDeg: 0 }, target).hints[0] === '✓ Cadrage aligné', 'aligné → ✓');

// ── 2) Dans la tolérance (yaw 5, pitch 5, roll 3) ──
const m1 = compareCameraOrientation({ yawDeg: 93, pitchDeg: -12, rollDeg: 2 }, target);
assert(m1.aligned, 'écarts sous tolérance → aligné');

// ── 3) Hors tolérance → guidage sensé ──
// tél pointe trop à droite (yaw 100 > 90) → tourner à GAUCHE ; trop haut (pitch 0 > -10) → BAISSER
const g = orientationGuidance({ yawDeg: 100, pitchDeg: 0, rollDeg: 8 }, target);
assert(!g.aligned, 'hors tolérance → non aligné');
assert(g.hints.some((h) => h.includes('à gauche')), 'yaw trop à droite → « à gauche »');
assert(g.hints.some((h) => /Baisse le téléphone/.test(h)), 'pitch trop haut → « Baisse »');
assert(g.hints.some((h) => /Redresse/.test(h)), 'roll → « Redresse »');
assert(g.hints.some((h) => /10°/.test(h)), 'écart yaw ~10° affiché');

// ── 4) Sens inverse ──
const g2 = orientationGuidance({ yawDeg: 80, pitchDeg: -20, rollDeg: 0 }, target);
assert(g2.hints.some((h) => h.includes('à droite')), 'yaw trop à gauche → « à droite »');
assert(g2.hints.some((h) => /Relève le téléphone/.test(h)), 'pitch trop bas → « Relève »');

// ── 5) Wrap 360° (yaw 359 vs cible 1 = 2° d'écart, pas 358) ──
const m2 = compareCameraOrientation({ yawDeg: 359, pitchDeg: 0, rollDeg: 0 }, { yawDeg: 1, pitchDeg: 0, rollDeg: 0 });
assert(near(m2.errors.yawDeg, 2), 'wrap 360° : 359↔1 = 2° d\'écart');
assert(m2.aligned, 'wrap : 2° dans la tolérance yaw 5°');

// ── 6) Tolérance custom ──
const mTight = compareCameraOrientation({ yawDeg: 92, pitchDeg: -10, rollDeg: 0 }, { ...target, tolerance: { yawDeg: 1 } });
assert(!mTight.aligned, 'tolérance yaw 1° : 2° d\'écart → non aligné');

console.log(`\norientation : ${ok}/${ok + ko} OK`);
process.exit(ko ? 1 : 0);
