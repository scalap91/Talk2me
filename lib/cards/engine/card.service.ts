/**
 * core/card-engine — SERVICE : couche métier de la SuperCard (le "moteur").
 * Spéc Gemini (reviews/_SPEC-PHASE0.md). C'est LE point d'entrée qui CRÉE / lit /
 * met à jour / distribue les Cards. À terme, tous les producteurs (IA, imports,
 * composer) passent par ici, et les lecteurs (feed, eat, shop…) lisent via searchCards.
 * Strangler : disponible mais pas encore branché à l'app.
 */
import { makeCard, type SuperCard, type CardType } from '@/lib/cards/supercard';
import { cardRepository, type CardFilters } from './card.repository';

export const cardService = {
  /** Crée une SuperCard (valeurs par défaut via makeCard) et la persiste. */
  createCard(input: Partial<SuperCard> & { title: string; types: CardType[] }): SuperCard {
    return cardRepository.save(makeCard(input));
  },

  getCard(id: string): SuperCard | null {
    return cardRepository.findById(id);
  },

  /** Applique un patch sur la card existante et resauvegarde (fusion superficielle). */
  updateCard(id: string, updates: Partial<SuperCard>): SuperCard | null {
    const current = cardRepository.findById(id);
    if (!current) return null;
    return cardRepository.save({ ...current, ...updates, id, updatedAt: Date.now() });
  },

  /** Suppression logique (soft delete). */
  deleteCard(id: string): boolean {
    return cardRepository.softDelete(id);
  },

  restoreCard(id: string): boolean {
    return cardRepository.restore(id);
  },

  /** Lecture filtrée — utilisée par les futurs lecteurs (feed/eat/shop/recherche…). */
  searchCards(filters: CardFilters = {}): SuperCard[] {
    return cardRepository.query(filters);
  },
};
