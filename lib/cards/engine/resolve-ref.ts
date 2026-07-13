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

/** Contexte d'une card pour la fusion éditoriale : ref d'entité + titre + texte de base. */
export function cardContext(id: string): { ref: string; title: string; baseText: string } {
  try {
    const row = getDb().prepare('SELECT * FROM direct_cards WHERE id = ? LIMIT 1').get(id) as Record<string, unknown> | undefined;
    if (row) {
      const c = cardFromDirectCard(parseDirectCardRow(row));
      const body = (c.text?.body || '').trim();
      const title = (c.title || body.split(/[.\n]/)[0] || 'Sujet').trim().slice(0, 140);
      return { ref: entityRef(c), title, baseText: body };
    }
  } catch {
    /* best-effort */
  }
  return { ref: `card:${id}`, title: 'Sujet', baseText: '' };
}
