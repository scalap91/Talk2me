/**
 * GET /api/cards/trash — Liste des cards soft-deleted du user courant dans
 * les 30 derniers jours. Page /trash s'en sert pour afficher la corbeille.
 *
 * Talk2Me Lot A (Pascal 2026-06-04).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCardTrash } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cards = getCardTrash(me.id, 30);
  return NextResponse.json({ ok: true, cards });
}
