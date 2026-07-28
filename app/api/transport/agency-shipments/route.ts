/**
 * GET /api/transport/agency-shipments — les colis CONFIÉS à l'agence connectée (vente boutique livraison
 * routée vers l'agence la plus proche). Alimente le dashboard « Mon agence » → à dispatcher aux chauffeurs.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listAgencyShipments } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, shipments: listAgencyShipments(me.id) });
}
