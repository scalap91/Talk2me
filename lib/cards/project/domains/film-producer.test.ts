/**
 * film-producer.test — VS1 : producteur-IA (prompts + application), purs.
 * Exécuter : npx tsx lib/cards/project/domains/film-producer.test.ts
 */
import {
  nextProducerStep, buildProducerPrompt, applyProducerOutput, constraintsSentence, PRODUCER_STEPS,
} from './film-producer';
import type { ProjectBlock } from '../../v2/types';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void { if (cond) ok++; else { ko++; console.log(`❌ ${msg}`); } }

const base: ProjectBlock = {
  domain: 'film',
  constraints: { locations: ['Antananarivo'], people: 4, devices: 1, target_duration_ms: 600000 },
  film: { creativeDevelopment: { idea: 'Une troupe de quartier monte Molière.' } },
};

// ── 1) Enchaînement des étapes ──
assert(nextProducerStep(base) === 'logline', 'idée seule → logline');
const p1 = { ...base, film: applyProducerOutput(base, 'logline', 'Un jeune metteur en scène...') };
assert(nextProducerStep(p1) === 'synopsis', 'logline posée → synopsis');
const p2 = { ...p1, film: applyProducerOutput(p1, 'synopsis', 'Dans un quartier...') };
assert(nextProducerStep(p2) === 'treatment', 'synopsis → treatment');
const p3 = { ...p2, film: applyProducerOutput(p2, 'treatment', 'Scène 1...') };
assert(nextProducerStep(p3) === 'screenplay', 'treatment → screenplay');
const p4 = { ...p3, film: applyProducerOutput(p3, 'screenplay', 'SCÈNE 1 - RUELLE...') };
assert(nextProducerStep(p4) === null, 'scénario écrit → plus rien à générer');

// ── 2) applyProducerOutput IMMUTABLE + borné + n'écrase que l'étape ──
assert((base.film as any).creativeDevelopment.logline === undefined, 'apply NE MUTE PAS l\'original');
assert((p1.film as any).creativeDevelopment.idea === (base.film as any).creativeDevelopment.idea, 'idée conservée');
const big = applyProducerOutput(base, 'logline', 'x'.repeat(50000));
assert(((big as any).creativeDevelopment.logline as string).length === 20000, 'texte borné à 20000');

// ── 3) La BOUSSOLE est dans le prompt ──
const pr = buildProducerPrompt(base, 'screenplay');
assert(/RÉALISABLE/i.test(pr.system), 'system : « réalisable »');
assert(/smartphone/i.test(pr.system), 'system : smartphone');
assert(/hollywood/i.test(pr.system), 'system : pas Hollywood');
assert(pr.user.includes('Antananarivo'), 'user : contrainte lieu injectée');
assert(pr.user.includes('Molière') || pr.user.includes('troupe'), 'user : idée injectée');
assert(pr.user.includes('smartphone'), 'user : rappel smartphone');

// ── 4) constraintsSentence ──
assert(constraintsSentence(base).includes('Antananarivo') && constraintsSentence(base).includes('smartphone'), 'contraintes résumées');
assert(constraintsSentence({ domain: 'film' }).includes('UN seul smartphone'), 'défaut = 1 smartphone minimal');

// ── 5) Le prompt de logline ne fuit PAS les étapes suivantes ──
const prL = buildProducerPrompt(base, 'logline');
assert(!prL.user.includes('Synopsis :') && !prL.user.includes('Traitement :'), 'logline : pas de contexte futur');

assert(PRODUCER_STEPS.length === 4, '4 étapes génératrices');

console.log(`\nfilm-producer : ${ok}/${ok + ko} OK`);
process.exit(ko ? 1 : 0);
