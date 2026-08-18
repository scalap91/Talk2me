import 'server-only';
/**
 * Card OS Strangler — helper de dual-write (Pascal 2026-07-03).
 *
 * Un SEUL endroit qui pousse une direct_card legacy vers le MOTEUR :
 *  - index `cardRepository` (table `cards`),
 *  - fichier `.card` public partageable (`writeCardFile`).
 * Appelé par chaque producteur (cards/create, publish-to-feed, ai-video, …) au lieu
 * de dupliquer le code. Best-effort : un échec moteur ne casse jamais le producteur.
 *
 * NB : ne PAS appeler ça depuis `lib/db` (createDirectCard) → import circulaire
 * (card.repository importe déjà `@/lib/db`). On branche au niveau producteur.
 */
import { writeCardFile } from '@/lib/cards/card-file';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import type { SuperCard } from '@/lib/cards/supercard';

type DirectCardInput = Parameters<typeof cardFromDirectCard>[0];

/**
 * Le moteur = USINE : il FABRIQUE le `.card` (fichier autonome) et le lâche.
 * AUCUNE carte n'est stockée dans une table « moteur ». La carte = le fichier `.card`.
 */
export async function saveToMoteur(sc: SuperCard): Promise<void> {
  try {
    await writeCardFile(sc); // écrit le fichier .card, point.
  } catch (e) {
    console.error('[card] échec écriture .card:', e);
  }
}

/** Dérive le `.card` d'une direct_card legacy, puis écrit le fichier. */
export async function syncDirectCardToMoteur(card: DirectCardInput): Promise<void> {
  try {
    const sc = cardFromDirectCard(card);
    await saveToMoteur(sc); // écrit le fichier .card
    // INDEX `cards` = source du feed unifié (getFeedFromCardsRanked, Pascal 2026-08-14).
    // SANS ce save, un post créé via /api/cards/create écrit son .card mais N'ENTRE PAS
    // dans l'index → invisible au feed (perçu « bloqué en brouillon »). Ciblé au chemin
    // POST (direct_card) : les annonces/boutique (saveToMoteur direct) restent hors index.
    try { cardRepository.save(sc); } catch (e) { console.error('[card] échec index cards:', e); }
  } catch (e) {
    console.error('[card] échec adapt direct_card:', e);
  }
}
