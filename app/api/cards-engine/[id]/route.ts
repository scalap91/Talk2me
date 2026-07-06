/**
 * Tranche 2 (Card OS) — API de LECTURE interne : une Card par id.
 * Spéc Gemini (reviews/_SPEC-PHASE2.md), auth maison synchrone. Strangler : chemin neuf,
 * rien d'existant touché, pas branché à l'UI.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardService } from '@/lib/cards/engine/card.service';
import type { SuperCard } from '@/lib/cards/supercard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  try {
    const card = cardService.getCard(id);
    if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ card });
  } catch (e) {
    console.error('[cards-engine] get error:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

/**
 * Tranche 4 (Card OS) — MODIFICATION d'une Card (PATCH).
 * Spéc Gemini (reviews/_SPEC-PHASE4.md). SÉCU : un user ne modifie QUE ses propres cards
 * (404 si absente, 403 si pas owner) ; champs immuables (id/owner/createdAt) retirés du patch.
 * Strangler : rien branché à l'UI.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  let updates: Partial<SuperCard>;
  try { updates = (await req.json()) as Partial<SuperCard>; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  try {
    const existing = cardService.getCard(id);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (existing.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    // Champs immuables : jamais modifiables via patch.
    const patch = { ...updates };
    delete patch.id;
    delete patch.owner;
    delete patch.createdAt;

    const updated = cardService.updateCard(id, patch);
    if (!updated) return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    return NextResponse.json({ card: updated }, { status: 200 });
  } catch (e) {
    console.error('[cards-engine] patch error:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
