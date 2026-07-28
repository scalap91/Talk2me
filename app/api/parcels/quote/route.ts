/**
 * POST /api/parcels/quote — devis d'envoi de colis via une agence (prix = tarif agence × distance).
 * Body : { agency_uid, o:{lat,lng}, d:{lat,lng} } → { ok, price_cents, km }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { quoteParcel } from '@/lib/parcel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { agency_uid?: string; o?: { lat?: number; lng?: number }; d?: { lat?: number; lng?: number } } = {};
  try { b = await req.json(); } catch { /* */ }
  if (!b.agency_uid || !b.o || !b.d) return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  const q = quoteParcel(b.agency_uid, Number(b.o.lat), Number(b.o.lng), Number(b.d.lat), Number(b.d.lng));
  if (!q.ok) return NextResponse.json({ error: q.error }, { status: 400 });
  return NextResponse.json({ ok: true, price_cents: q.price_cents, km: q.km, currency: process.env.MARKET_CURRENCY || 'MGA' });
}
