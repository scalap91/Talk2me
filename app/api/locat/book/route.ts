/** LOCAT👀 — réserver un bien à louer. POST {id, dates:[YYYY-MM-DD]} → crée la réservation
 *  (durée × tarif selon l'unité, conflits refusés). Le PAIEMENT escrow suit (tranche 2b). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createBooking } from '@/lib/rental-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  const dates = Array.isArray(b.dates) ? b.dates.map((d) => String(d)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!id || !dates.length) return NextResponse.json({ error: 'bad_request', need: 'id + dates' }, { status: 400 });
  const r = createBooking(me.id, id, dates);
  if (!r.ok) return NextResponse.json({ error: r.error || 'booking_failed' }, { status: 409 });
  return NextResponse.json({ ok: true, booking: r.booking });
}
