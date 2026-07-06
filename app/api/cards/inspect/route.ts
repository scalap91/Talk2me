/**
 * GET /api/cards/inspect?id= — INSPECTEUR DE CARDS, Phase 1 (lecture seule).
 *
 * UN SEUL FORMAT `.card` (Pascal : « il n'y a qu'un format PDF »). L'inspecteur est
 * AGNOSTIQUE DE LA SOURCE : il résout LE `.card` par son id, peu importe la table qui
 * le stocke (feed / annonce / boutique). Zéro branchement par type de card.
 * Caviardé pour les non-propriétaires (air-gap PII).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCardInspectRow } from '@/lib/db';
import { getAnnonceInspect } from '@/lib/annonces-deposit';
import { getItemInspect } from '@/lib/simple-shop';
import { parseCard } from '@/lib/cards/supercard';
import { redactCard, cardRelations, cardFilledFacets } from '@/lib/cards/inspect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Resolved = { user_id: string; created_at: number; dotcard: string | null; source: string };

/** Résout le `.card` par id à travers TOUTES les sources — le format est unique. */
function resolveCard(id: string): Resolved | null {
  const feed = getCardInspectRow(id);
  if (feed) return { user_id: feed.user_id, created_at: feed.created_at, dotcard: feed.dotcard, source: 'feed' };
  const annonce = getAnnonceInspect(id);
  if (annonce) return { ...annonce, source: 'annonce' };
  const item = getItemInspect(id);
  if (item) return { ...item, source: 'boutique' };
  return null;
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const found = resolveCard(id);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!found.dotcard) return NextResponse.json({ error: 'no_card', message: 'Objet ancien : pas encore de .card.' }, { status: 422 });
  const parsed = parseCard(found.dotcard);
  if (!parsed.ok || !parsed.card) return NextResponse.json({ error: 'unreadable', reason: parsed.reason }, { status: 422 });

  const isOwner = !!me && me.id === found.user_id;
  const card = redactCard(parsed.card, isOwner);

  return NextResponse.json({
    ok: true,
    isOwner,
    card,
    meta: {
      id,
      source: found.source,
      created_at: found.created_at,
      version: card.version ?? 1,
      state: card.state ?? 'published',
      owner: isOwner ? 'vous' : 'un autre utilisateur',
    },
    relations: cardRelations(card),
    facets: cardFilledFacets(card),
  });
}
