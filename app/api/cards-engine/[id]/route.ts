/**
 * Tranche 2 (Card OS) — API de LECTURE interne : une Card par id.
 * Spéc Gemini (reviews/_SPEC-PHASE2.md), auth maison synchrone. Strangler : chemin neuf,
 * rien d'existant touché, pas branché à l'UI.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardService } from '@/lib/cards/engine/card.service';

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
