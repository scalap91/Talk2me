/**
 * Tranche 2 (Card OS) — API de LECTURE interne du moteur : liste de Cards.
 * Spéc Gemini (reviews/_SPEC-PHASE2.md), câblée sur l'auth maison (getCurrentUserFromRequest,
 * SYNCHRONE). Strangler : chemin NEUF /api/cards-engine, ne touche aucune route existante,
 * pas branché à l'UI. Sert juste à lire le moteur via HTTP pour préparer la suite.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardService } from '@/lib/cards/engine/card.service';
import type { CardFilters } from '@/lib/cards/engine/card.repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const filters: CardFilters = {};
  if (sp.get('owner')) filters.owner = sp.get('owner')!;
  if (sp.get('channel')) filters.channel = sp.get('channel')!;
  if (sp.get('type')) filters.type = sp.get('type')!;
  if (sp.get('state')) filters.state = sp.get('state')!;
  if (sp.get('includeDeleted') === 'true') filters.includeDeleted = true;

  const limitRaw = sp.get('limit');
  if (limitRaw !== null) {
    const limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) return NextResponse.json({ error: 'invalid_limit' }, { status: 400 });
    filters.limit = limit;
  }
  const offsetRaw = sp.get('offset');
  if (offsetRaw !== null) {
    const offset = parseInt(offsetRaw, 10);
    if (!Number.isFinite(offset) || offset < 0) return NextResponse.json({ error: 'invalid_offset' }, { status: 400 });
    filters.offset = offset;
  }

  try {
    return NextResponse.json({ cards: cardService.searchCards(filters) });
  } catch (e) {
    console.error('[cards-engine] search error:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
