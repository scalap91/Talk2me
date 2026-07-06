/**
 * Disponibilité d'un véhicule en location. Pascal 2026-06-26 (Phase 1).
 *  GET  ?id=…              → { blocked:[], booked:[] } (jours indisponibles).
 *  POST { id, date, blocked } → bloque/débloque un jour (PROPRIÉTAIRE uniquement).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUnavailableDates, setDayBlocked } from '@/lib/rental-planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  return NextResponse.json({ ok: true, ...getUnavailableDates(id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  const date = typeof b.date === 'string' ? b.date : '';
  const blocked = !!b.blocked;
  if (!id || !date) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = setDayBlocked(me.id, id, date, blocked);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
