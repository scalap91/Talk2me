import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createOrUpdateOffer, listOffersForRequest, getTransportRequest } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — un transporteur propose un prix sur une demande.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { request_id?: string; price_cents?: number; note?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.request_id) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });
  if (!b.price_cents || b.price_cents <= 0) return NextResponse.json({ error: 'price_required' }, { status: 400 });
  const r = createOrUpdateOffer(b.request_id, me.id, b.price_cents, b.note);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, offer: r.offer });
}

// GET ?request_id= — offres reçues sur MA demande (réservé au demandeur).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const requestId = req.nextUrl.searchParams.get('request_id') || '';
  if (!requestId) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });
  const reqRow = getTransportRequest(requestId);
  if (!reqRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (reqRow.requester_id !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, offers: listOffersForRequest(requestId) });
}
