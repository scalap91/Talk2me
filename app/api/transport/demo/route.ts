/**
 * Talk2Me — Démo bout-en-bout de l'acheminement relais (test de toute la chaîne).
 * Crée un article + bon de transport, fabrique 2 porteurs + 1 client (bots), fait cheminer
 * le colis étape par étape (notifications à chaque étape) jusqu'au paiement SIMULÉ.
 * L'utilisateur courant = le VENDEUR (il reçoit les notifications + voit l'itinéraire).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { runDemo } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = runDemo(me.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
