/**
 * Talk2Me — Bon de transport / colis (Brique B).
 * GET  ?id= → trace (itinéraire) | ?tracking= → trace par n° | sinon → mes colis.
 * POST → créer un colis { product_label, buyer_id?, o{lat,lng,label}, d{...}, parcel_size?, parcel_weight? }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createShipment, listMyShipments, getTrace, getByTracking, getShipmentIdByEscrow } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const tracking = req.nextUrl.searchParams.get('tracking');
  const escrow = req.nextUrl.searchParams.get('escrow'); // suivi ouvert depuis une commande boutique/Eat (on a l'escrow, pas l'id colis)
  if (id) { const t = getTrace(id); return t ? NextResponse.json({ ok: true, ...t }) : NextResponse.json({ error: 'not_found' }, { status: 404 }); }
  if (tracking) { const sh = getByTracking(tracking); if (!sh) return NextResponse.json({ error: 'not_found' }, { status: 404 }); return NextResponse.json({ ok: true, ...getTrace(sh.id) }); }
  if (escrow) { const sid = getShipmentIdByEscrow(escrow); if (!sid) return NextResponse.json({ error: 'not_found' }, { status: 404 }); return NextResponse.json({ ok: true, ...getTrace(sid) }); }
  return NextResponse.json({ ok: true, shipments: listMyShipments(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const o = b.o as Record<string, number & string> | undefined, d = b.d as Record<string, number & string> | undefined;
  if (!o || !d || typeof o.lat !== 'number' || typeof d.lat !== 'number') return NextResponse.json({ error: 'bad_points' }, { status: 400 });
  const r = createShipment({
    sellerId: me.id,
    buyerId: typeof b.buyer_id === 'string' ? b.buyer_id : null,
    productLabel: String(b.product_label || ''),
    orderId: typeof b.order_id === 'string' ? b.order_id : undefined,
    oLat: o.lat, oLng: o.lng, oLabel: String(o.label || ''),
    dLat: d.lat, dLng: d.lng, dLabel: String(d.label || ''),
    parcelSize: String(b.parcel_size || ''), parcelWeight: String(b.parcel_weight || ''),
  });
  return NextResponse.json({ ok: true, ...r });
}
