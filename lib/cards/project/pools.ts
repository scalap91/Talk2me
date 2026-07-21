import 'server-only';
/**
 * lib/cards/project/pools — assemble les POOLS D'OFFRE du Discovery Engine depuis l'écosystème
 * Talk2Me EXISTANT (VS6). Le moteur (engine.ts) est PUR et ne lit rien ; c'est ICI (L3) qu'on
 * traduit un tag de capacité en requête vers les vraies cartes (place/resto→lieu, album→musique,
 * boutique→matériel…) et qu'on les présente comme OPPORTUNITÉS (leads : cartes existantes à
 * convertir, jamais comptées comme offre sécurisée — cf. l'échelle du moteur).
 *
 * BOUSSOLE [[feedback_talk2me_democratiser_creation]] : on cherche D'ABORD ce que la personne/son
 * quartier ONT DÉJÀ ; la mission n'est que le résidu. Orchestration, zéro duplication.
 */
import { cardRepository } from '@/lib/cards/engine/card.repository';
import type { OpportunitySignal } from './engine';
import type { ProjectNeed } from '../v2/types';

// Tag de capacité → types/channels de cartes existantes qui savent le faire.
const CAP_TO_TYPES: Record<string, string[]> = {
  location: ['place', 'property', 'eat', 'restaurant'],
  venue: ['place', 'property'],
  event_space: ['place', 'property', 'eat'],
  soundtrack: ['album', 'music', 'audio'],
  sound: ['audio', 'music'],
  equipment: ['product', 'boutique'],
  prop: ['product', 'boutique'],
  vehicle: ['vehicle'],
  catering: ['eat', 'restaurant'],
  footage: ['video'],
  visual_asset: ['image'],
};
const CAP_TO_CHANNELS: Record<string, string[]> = {
  equipment: ['boutique'], prop: ['boutique'], catering: ['eat'], location: ['eat'],
};

const norm = (s?: string): string => (s ?? '').trim().toLocaleLowerCase('fr-FR');

/**
 * Cherche, pour chaque besoin, les cartes existantes qui peuvent y répondre → opportunités.
 * Bonus de score si la ville de la carte == la localisation du besoin (proximité).
 * best-effort : toute erreur de requête est ignorée (le moteur retombera sur des missions).
 */
export function buildOpportunitiesFromCards(needs: ProjectNeed[]): OpportunitySignal[] {
  const out: OpportunitySignal[] = [];
  const seen = new Set<string>();
  for (const need of needs) {
    const tag = need.kind;
    const types = CAP_TO_TYPES[tag] ?? [];
    const channels = CAP_TO_CHANNELS[tag] ?? [];
    const cards: { id: string; place?: { city?: string } }[] = [];
    try {
      for (const t of types) cards.push(...(cardRepository.query({ type: t, state: 'published', limit: 15 }) as unknown as typeof cards));
      for (const ch of channels) cards.push(...(cardRepository.query({ channel: ch, state: 'published', limit: 15 }) as unknown as typeof cards));
    } catch { /* best-effort */ }
    const wantCity = norm(need.location);
    for (const c of cards) {
      const key = `${need.id}:${c.id}`;
      if (seen.has(key) || !c.id) continue;
      seen.add(key);
      const sameCity = wantCity && norm(c.place?.city) === wantCity;
      out.push({ ref: c.id, capabilities: [tag], score: sameCity ? 80 : 55 });
    }
  }
  return out;
}
