/**
 * Demandes de réservation côté PROPRIÉTAIRE. Pascal 2026-06-26 (Phase 2).
 *  GET                       → mes demandes (pending + acceptées).
 *  POST { bookingId, action } → 'accept' (réserve les jours) | 'refuse' (demande pending)
 *                              | 'cancel' (annule une location PAYÉE avant le début : locataire OU propriétaire).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listOwnerBookings, setBookingStatus, cancelPaidRental } from '@/lib/rental-planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, bookings: listOwnerBookings(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const bookingId = typeof b.bookingId === 'string' ? b.bookingId : '';
  if (!bookingId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // Annulation d'une location PAYÉE (locataire OU propriétaire ; cancelPaidRental fait l'auth + le remboursement).
  if (b.action === 'cancel') {
    const r = cancelPaidRental(bookingId, me.id);
    return r.ok ? NextResponse.json({ ok: true, refunded: !!r.refunded }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  const action = b.action === 'accept' ? 'accept' : b.action === 'refuse' ? 'refuse' : null;
  if (!action) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = setBookingStatus(me.id, bookingId, action);
  if (!ok) return NextResponse.json({ error: 'failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
