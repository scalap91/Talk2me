/**
 * GET /api/transport/referent-shipments (Pascal 2026-07-28)
 * Le contributeur RÉFÉRENT suit les colis portés par SES chauffeurs (sa downline) et peut REJOUER
 * la séquence d'un colis (sur la carte Drive) quand il se perd / traîne.
 *  - sans param        → { shipments } : liste des colis actifs de mes chauffeurs (flag « à l'arrêt »).
 *  - ?timeline=<id>    → { timeline } : les événements du colis (positions incluses), SI c'est un de mes
 *                        chauffeurs qui le porte (sinon 403). Pour appeler les 2 parties : IN-APP par user-id
 *                        (on n'expose PAS les numéros). Le référent NE décide PAS de refund (gouvernance).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { shipmentsForReferent, shipmentTimelineForReferent } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const timelineId = req.nextUrl.searchParams.get('timeline');
  if (timelineId) {
    const t = shipmentTimelineForReferent(me.id, timelineId);
    if (!t) return NextResponse.json({ error: 'forbidden' }, { status: 403 }); // pas un colis de tes chauffeurs
    return NextResponse.json({ ok: true, timeline: t });
  }

  return NextResponse.json({ ok: true, shipments: shipmentsForReferent(me.id) });
}
