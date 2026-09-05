/** LOCAT👀 — réservations. GET → { as_renter, as_owner }. POST {id, action} :
 *  'returned' (le locataire rend le bien) · 'validate' (le propriétaire valide → encaisse l'escrow). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listRenterBookings, listOwnerBookings, setReturned, validateReturn } from '@/lib/rental-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, as_renter: listRenterBookings(me.id), as_owner: listOwnerBookings(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  const action = String(b.action || '');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  if (action === 'returned') return NextResponse.json({ ok: setReturned(me.id, id) }); // locataire
  if (action === 'validate') return NextResponse.json(validateReturn(me.id, id));      // propriétaire → encaisse
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
