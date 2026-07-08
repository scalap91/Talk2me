/**
 * Résout l'id d'un post (direct_card) → sa RÉFÉRENCE D'ENTITÉ (page-entité vivante).
 * Deux partages du même contenu → même ref → mêmes contributeurs/enrichissements.
 * Contenu perso/absent → `card:<id>` (unique). Pascal 2026-07-08.
 */
import { getDb } from '@/lib/db';
import { parseDirectCardRow } from '@/lib/db-direct-cards';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { entityRef } from '@/lib/cards/entity-key';

export function entityRefFromCardId(id: string): string {
  try {
    const row = getDb().prepare('SELECT * FROM direct_cards WHERE id = ? LIMIT 1').get(id) as Record<string, unknown> | undefined;
    if (row) return entityRef(cardFromDirectCard(parseDirectCardRow(row)));
  } catch {
    /* best-effort */
  }
  return `card:${id}`;
}
