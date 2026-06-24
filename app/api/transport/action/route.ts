/**
 * Talk2Me — Actions d'acheminement (Brique B). POST { shipment_id, action, ... }.
 * actions : assign (porteur accepte) | pickup | depart | ping | handoff | deliver.
 * Les remises (pickup/handoff/deliver) se valident par les 4 derniers chiffres du téléphone.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  assignLeg, assignCarrierByPhone, confirmPickup, markDeparted, pingPosition, markArrived, confirmDelivery, getTrace, carrierStatusReply,
  shareColisPosition, setBuyerDropoff,
} from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const sid = String(b.shipment_id || '');
  if (!sid) return NextResponse.json({ error: 'shipment_id_required' }, { status: 400 });
  const last4 = String(b.last4 || '');

  let r: { ok: boolean; error?: string };
  switch (b.action) {
    case 'assign': r = assignLeg(sid, me.id, String(b.trip_id || '')); break;
    case 'assign_phone': r = assignCarrierByPhone(sid, me.id, String(b.phone || '')); break;
    case 'pickup': r = confirmPickup(sid, me.id, last4); break;
    case 'depart': r = markDeparted(sid, me.id, Number(b.duration_min) || 60); break;
    case 'ping': r = pingPosition(sid, me.id, Number(b.lat), Number(b.lng)); break;
    case 'arrived': r = markArrived(sid, me.id); break;
    case 'deliver': r = confirmDelivery(sid, me.id, last4); break;
    case 'status_reply': { const k = String(b.kind); r = (k === 'panne' || k === 'pause' || k === 'ras') ? carrierStatusReply(sid, me.id, k) : { ok: false, error: 'bad_kind' }; break; }
    case 'share_pos': r = shareColisPosition(sid, me.id, Number(b.lat), Number(b.lng)); break;
    case 'set_dropoff': r = setBuyerDropoff(sid, me.id, Number(b.lat), Number(b.lng)); break;
    default: return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...getTrace(sid) });
}
