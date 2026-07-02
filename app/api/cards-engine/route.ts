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
import type { SuperCard, CardType } from '@/lib/cards/supercard';

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

/**
 * Tranche 3 (Card OS) — API de CRÉATION : écrit une Card dans le moteur.
 * Spéc Gemini (reviews/_SPEC-PHASE3.md). owner FORCÉ = user connecté (un user ne crée
 * jamais au nom d'un autre). Strangler : rien branché à l'UI, sert à remplir l'entrepôt.
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const title = body.title;
  const types = body.types;
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }
  if (!Array.isArray(types) || types.length === 0 || !types.every((t) => typeof t === 'string' && t.trim())) {
    return NextResponse.json({ error: 'types_required' }, { status: 400 });
  }

  try {
    const card = cardService.createCard({
      ...(body as Partial<SuperCard>),
      title: title.trim(),
      types: (types as string[]).map((t) => t.trim()) as CardType[],
      owner: user.id, // impératif : jamais au nom d'un autre
    });
    return NextResponse.json({ card }, { status: 201 });
  } catch (e) {
    console.error('[cards-engine] create error:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
