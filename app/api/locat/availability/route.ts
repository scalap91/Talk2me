/** LOCAT👀 — disponibilité d'un bien à louer (calendrier). GET ?id= → {blocked, booked} + devis
 *  optionnel si ?dates=. POST {id, date, blocked} = le propriétaire bloque/débloque un jour. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUnavailableDates, setDayBlocked, priceFor } from '@/lib/rental-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  const { blocked, booked } = getUnavailableDates(id);
  const datesParam = req.nextUrl.searchParams.get('dates');
  const quote = datesParam ? priceFor(id, datesParam.split(',').filter(Boolean)) : null;
  return NextResponse.json({ ok: true, blocked, booked, quote });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  const date = String(b.date || '');
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = setDayBlocked(me.id, id, date, !!b.blocked); // false si pas le propriétaire
  return NextResponse.json({ ok });
}
