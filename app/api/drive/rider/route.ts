/** Talk N Drive — état côté PASSAGER + favoris (l'anti-Uber).
 *  GET  : course active + liste des chauffeurs favoris (avec statut en ligne).
 *  POST : {action:'cancel', ride_id}
 *         {action:'favorite', driver_id} / {action:'unfavorite', driver_id} */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  getActiveRideForRider,
  getFavoriteDrivers,
  addFavoriteDriver,
  removeFavoriteDriver,
  updateRideStatus,
  getRideRow,
} from '@/lib/db';
import { refundEscrow } from '@/lib/escrow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    active: getActiveRideForRider(me.id),
    favorites: getFavoriteDrivers(me.id),
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; ride_id?: string; driver_id?: string };

  if (b.action === 'cancel') {
    if (!b.ride_id) return NextResponse.json({ error: 'no_ride' }, { status: 400 });
    const r = updateRideStatus(b.ride_id, me.id, 'annulee');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // Cash INTERDIT : si la course était payée (escrow PaPi), on REMBOURSE le passager à l'annulation.
    try { const row = getRideRow(b.ride_id); if (row?.escrow_id && row.paid) refundEscrow(row.escrow_id); } catch { /* réglable via /api/wallet/escrow */ }
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'favorite' && b.driver_id) {
    addFavoriteDriver(me.id, b.driver_id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'unfavorite' && b.driver_id) {
    removeFavoriteDriver(me.id, b.driver_id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
