/**
 * lib/cards/project/engine.test — tests du Discovery Engine + contrat canonique.
 * Exécuter : npx tsx lib/cards/project/engine.test.ts
 */
import { detectNeeds, resolveNeed, capabilitiesOf, type SupplyPools } from './engine';
import './domains/film'; // enregistre le domaine film (side-effect)
import { validateCard } from '../v2/validate';
import type { SuperCardV2, ProjectBlock } from '../v2/types';

let ok = 0, ko = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { ok++; } else { ko++; console.log(`❌ ${msg}`); }
}

// ── 1) Détection de besoins (domaine film) ──
const project: ProjectBlock = {
  domain: 'film',
  film: {
    scenes: [{
      id: 'scene:banquet', title: 'Le grand banquet', summary: 'Argan face à une foule.',
      location: 'Antananarivo', requiredAssets: ['costumes XVIIe'],
      productionHints: { crowdSize: 30, requiresSoundtrack: true, requiresAuthorization: true },
    }],
  },
};
const needs = detectNeeds(project);
assert(needs.some((n) => n.kind === 'crowd' && n.quantity?.required === 30), 'besoin crowd(30) détecté');
assert(needs.some((n) => n.kind === 'location'), 'besoin location détecté');
assert(needs.some((n) => n.kind === 'soundtrack'), 'besoin soundtrack détecté');
assert(needs.some((n) => n.kind === 'authorization'), 'besoin authorization détecté');
assert(needs.some((n) => n.kind === 'costume'), 'asset costume → capacité costume');

// ── 2) Capacités dérivées (générique, pas de cinéma) ──
const restaurant: SuperCardV2 = { format: 't2m.card', spec: 2, id: 'card_resto', kind: 'restaurant', owner: 'user_r', status: 'published', visibility: 'public', created_at: 0, updated_at: 0, place: { city: 'Antananarivo' }, food: {} };
const caps = capabilitiesOf(restaurant);
assert(caps.includes('location') && caps.includes('catering'), 'restaurant → location + catering');

// ── 3) Résolution : 12 figurants en resource → mission 18 (dernier recours) ──
const crowdNeed = needs.find((n) => n.kind === 'crowd')!;
const res12: SuperCardV2 = { format: 't2m.card', spec: 2, id: 'card_res12', kind: 'resource', owner: 'user_c', status: 'published', visibility: 'public', created_at: 0, updated_at: 0, resource: { kind: 'crowd', quantity_available: 12, location: 'Antananarivo', capabilities: ['crowd'] } };
const pools: SupplyPools = { resources: [res12], opportunities: [{ external_ref: 'weather:tana', capabilities: ['crowd'], score: 40 }] };
const r = resolveNeed(crowdNeed, pools, { owner: 'user_pascal', projectCardId: 'card_abc', now: 0 });

assert(r.candidates.some((c) => c.provenance === 'resource' && c.quantity === 12), 'candidat resource q=12');
assert(r.candidates.some((c) => c.provenance === 'opportunity' && c.external_ref === 'weather:tana'), 'opportunity surfacée (external_ref)');
assert(r.updatedNeed.status === 'partially_filled', 'besoin partially_filled');
assert(!!r.mission && r.mission.mission?.quantity_required === 18, 'mission créée pour le résidu 18');
assert(r.mission?.mission?.compensation?.mode === 'revenue_share', 'mission par défaut revenue_share');
// la mission produite DOIT valider le canon (spec:2, owner opaque, aucun argent)
const mv = validateCard(r.mission);
assert(mv.ok, 'mission produite valide le canon' + (mv.ok ? '' : ' → ' + mv.errors.slice(0, 3).map((e) => e.path + ':' + e.message).join(' ; ')));

// ── 4) Asset comble sans mission ──
const soundtrackNeed = needs.find((n) => n.kind === 'soundtrack')!;
const musicAsset: SuperCardV2 = { format: 't2m.card', spec: 2, id: 'card_music', kind: 'audio', owner: 'user_m', status: 'published', visibility: 'public', created_at: 0, updated_at: 0 };
const r2 = resolveNeed(soundtrackNeed, { assets: [musicAsset] }, { owner: 'user_pascal', projectCardId: 'card_abc', now: 0 });
assert(r2.candidates.some((c) => c.provenance === 'asset' && c.ref === 'card_music'), 'asset audio → candidat asset (soundtrack)');
assert(!r2.mission && r2.updatedNeed.status === 'matched', 'asset comble le besoin → PAS de mission');

console.log(`\n${ko === 0 ? '✅ TOUT PASSE' : '❌ ÉCHECS'} — ${ok} ok / ${ko} ko`);
if (ko > 0) process.exit(1);
