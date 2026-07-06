/**
 * lib/cards/inspect — INSPECTEUR DE CARDS (Card OS, Pascal 2026-07-01).
 * « Comme Inspecter dans le navigateur, mais pour les Cards. » Pur (browser-safe).
 * Phase 1 = LECTURE SEULE. Deux garde-fous doctrine :
 *   - Caviardage PII/secrets pour les non-propriétaires (air-gap [[feedback_talk2me_pii_air_gap]]).
 *   - Les relations sont calculées depuis les lecteurs (readers.accepts), pas devinées.
 */
import type { SuperCard } from '@/lib/cards/supercard';
import { READERS, readerAccepts } from '@/lib/cards/readers';

/**
 * Retire ce qu'un non-propriétaire ne doit JAMAIS voir : identité owner, clés/refs API,
 * détail d'affiliation, signature. Le propriétaire voit tout (sauf que l'`api` reste
 * une référence, jamais une clé — les clés ne sont pas censées vivre dans la card).
 */
export function redactCard(card: SuperCard, isOwner: boolean): SuperCard {
  if (isOwner) return card;
  const c: SuperCard = { ...card };
  delete (c as Partial<SuperCard>).owner;
  delete (c as Partial<SuperCard>).affiliation;
  delete (c as Partial<SuperCard>).signature;
  if (c.api) c.api = { provider: c.api.provider }; // provider ok ; endpoint/ref masqués
  return c;
}

/** Quels LECTEURS révèlent cette card (où elle « vit »). Calculé, pas inventé. */
export function cardRelations(card: SuperCard): { reader: string; name: string; emoji: string }[] {
  return Object.values(READERS)
    .filter((r) => readerAccepts(r, card))
    .map((r) => ({ reader: r.reader, name: r.name, emoji: r.emoji }));
}

/** Facettes RENSEIGNÉES (les « extensions » qui complètent la card). */
export function cardFilledFacets(card: SuperCard): string[] {
  const keys: (keyof SuperCard)[] = ['text', 'images', 'video', 'audio', 'link', 'place', 'price', 'specs', 'deposit', 'stock', 'rating', 'categories', 'keywords', 'actions'];
  return keys.filter((k) => {
    const v = card[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }) as string[];
}
