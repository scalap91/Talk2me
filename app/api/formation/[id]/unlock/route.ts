/**
 * POST /api/formation/[id]/unlock (Pascal 2026-07-03)
 * Débloque la formation pour l'user courant. MVP : on accorde l'accès directement.
 * Le VRAI paiement passera par le rail unique /api/commerce/buy, qui appellera
 * grantFormationAccess() sur paiement confirmé (même rail que la boutique).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { readCardFileRaw } from '@/lib/cards/card-file';
import { parseCard } from '@/lib/cards/supercard';
import { grantFormationAccess } from '@/lib/formation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await readCardFileRaw(id);
  if (!raw) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const parsed = parseCard(raw);
  if (!parsed.ok || !parsed.card) return NextResponse.json({ error: 'unreadable' }, { status: 404 });
  const types = (parsed.card as unknown as { types?: string[] }).types || [];
  if (!types.includes('formation')) return NextResponse.json({ error: 'not_formation' }, { status: 400 });

  grantFormationAccess(me.id, id);
  return NextResponse.json({ ok: true, unlocked: true });
}
