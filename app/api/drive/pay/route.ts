/**
 * POST /api/drive/pay { ride_id, msisdn? } — PAIEMENT de la course (Pascal 2026-07-17, CASH INTERDIT).
 * Le passager paie sa course une fois le CHAUFFEUR accepté (vendeur connu) via le rail unique
 * `startOrder` (escrow : solde wallet → bloqué direct ; sinon PaPi/MVola → escrow financé au callback).
 * L'escrow est libéré au chauffeur à `terminee`, remboursé à `annulee` (voir routes driver/rider).
 * Réponse : { ok, mode:'paid'|'pay', escrow_id, checkout_url, quote }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRideRow, setRidePaid } from '@/lib/db';
import { startOrder } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ride_id?: string; msisdn?: string };
  if (!body.ride_id) return NextResponse.json({ error: 'no_ride' }, { status: 400 });

  const ride = getRideRow(body.ride_id);
  if (!ride) return NextResponse.json({ error: 'no_ride' }, { status: 404 });
  if (ride.rider_id !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (ride.paid) return NextResponse.json({ ok: true, already_paid: true });
  if (ride.status === 'terminee' || ride.status === 'annulee') return NextResponse.json({ error: 'ride_closed' }, { status: 400 });
  if (!ride.driver_id) return NextResponse.json({ error: 'no_driver' }, { status: 400 }); // chauffeur pas encore accepté
  if (!ride.fare_cents || ride.fare_cents <= 0) return NextResponse.json({ error: 'no_fare' }, { status: 400 });

  const r = await startOrder({
    userId: me.id,
    amountCents: ride.fare_cents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: 'ride',
    itemId: ride.id,
    sellerId: ride.driver_id, // le chauffeur = le vendeur (part libérée à `terminee`)
    commissionFromSeller: true, // 3% déduit du chauffeur (le passager paie le tarif, pas la commission)
  });
  if (!r.ok || !r.escrow_id) return NextResponse.json({ error: r.error || 'order_failed' }, { status: 400 });

  setRidePaid(ride.id, r.escrow_id);
  return NextResponse.json({
    ok: true,
    mode: r.mode,                // 'paid' (bloqué via solde) | 'pay' (paiement PaPi en cours)
    escrow_id: r.escrow_id,
    intent_id: r.intent?.id,
    checkout_url: r.checkout_url, // page PaPi (null si push USSD / payé au solde)
    currency: MARKET_CURRENCY,
    quote: r.quote,
  });
}
