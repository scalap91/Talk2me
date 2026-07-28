/**
 * POST /api/parcels/send — envoie un colis via une agence (P2P, prix fixe agence). RÉUTILISE le
 * rail boutique (startParcel → escrow financé → colis Système B en RETRAIT). L'agence détient et
 * valide le code au retrait ; l'argent (prix − commission) est libéré vers l'agence à ce moment.
 * Body : { agency_uid, o:{lat,lng,label?}, d:{lat,lng,label?}, msisdn? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { quoteParcel } from '@/lib/parcel';
import { startParcel } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { agency_uid?: string; o?: { lat?: number; lng?: number; label?: string }; d?: { lat?: number; lng?: number; label?: string }; msisdn?: string } = {};
  try { b = await req.json(); } catch { /* */ }
  if (!b.agency_uid || !b.o || !b.d) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  // PRIX résolu CÔTÉ SERVEUR (jamais fait confiance au client) via le tarif de l'agence.
  const q = quoteParcel(b.agency_uid, Number(b.o.lat), Number(b.o.lng), Number(b.d.lat), Number(b.d.lng));
  if (!q.ok || !q.price_cents) return NextResponse.json({ error: q.error || 'quote_failed' }, { status: 400 });

  const r = await startParcel({
    userId: me.id, currency: MARKET_CURRENCY, msisdn: b.msisdn || null,
    agencyUid: q.agency!.uid, priceCents: q.price_cents,
    oLat: Number(b.o.lat), oLng: Number(b.o.lng), oLabel: (b.o.label || q.agency!.depot_label || 'Dépôt agence'),
    dLat: Number(b.d.lat), dLng: Number(b.d.lng), dLabel: (b.d.label || 'Destination'),
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'send_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, intent_id: r.intent?.id, checkout_url: r.checkout_url, quote: r.quote, currency: MARKET_CURRENCY });
}
