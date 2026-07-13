/**
 * core/card-engine — PUBLICATION avec DÉDUP (page-entité vivante, Pascal 2026-07-08).
 *
 * Règle : à la publication, on calcule la clé d'entité.
 *  - Si une card canonique existe déjà pour cette clé → on NE duplique PAS : le partageur
 *    devient CONTRIBUTEUR de la card existante (deduped: true).
 *  - Sinon → on crée la card, et le créateur en est le 1er contributeur (deduped: false).
 * Résultat : 1 clé = 1 card canonique = 1 page ; la viralité concentre au lieu de fragmenter.
 * Voir mémoire [[project_talk2me_page_entite_vivante]].
 */
import type { SuperCard } from '@/lib/cards/supercard';
import { computeEntityKey, entityRef } from '@/lib/cards/entity-key';
import { cardRepository } from './card.repository';
import { addContributor, contributorCount } from './contributors';

export interface PublishResult {
  /** La card CANONIQUE de l'entité (existante si dédup, sinon la nouvelle). */
  card: SuperCard;
  /** true = l'entité existait déjà, le user a été rattaché comme contributeur. */
  deduped: boolean;
  /** Nombre de contributeurs après cette publication. */
  contributors: number;
}

/**
 * Publie une card au nom de `userId`, avec dédup par clé d'entité.
 * Le `owner` de la card canonique reste le PREMIER (on ne l'écrase jamais lors d'un rattachement).
 */
export function publishCard(input: SuperCard, userId: string): PublishResult {
  const ref = entityRef(input);
  const entityKey = input.entityKey ?? computeEntityKey(input) ?? undefined;
  // 1er contributeur de cette entité ? (compté AVANT l'ajout → détermine creator/sharer + deduped)
  const first = contributorCount(ref) === 0;

  // Card CANONIQUE de l'entité (table cards) : réutilisée si l'entité existe, sinon créée.
  let card = entityKey ? cardRepository.findByEntityKey(entityKey) : null;
  if (!card) {
    card = cardRepository.save({ ...input, entityKey, owner: input.owner || userId });
  }

  // Le partageur devient contributeur de l'ENTITÉ (clé = ref) — creator si 1er, sinon sharer.
  addContributor(ref, userId, first ? 'creator' : 'sharer');
  return { card, deduped: !first, contributors: contributorCount(ref) };
}
