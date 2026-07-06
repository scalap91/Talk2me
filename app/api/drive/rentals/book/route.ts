/**
 * POST /api/drive/rentals/book { id, dates:[], msisdn? } — RÉSERVATION via PaPi.
 * Pascal 2026-06-26 : on PASSE PAR PAPI (MVola/Orange/Airtel/Visa), mais la page PaPi est
 * affichée DANS l'app (modal iframe côté client), pas dans un navigateur externe.
 *
 * Flux : startOrder(forceExternal=PaPi) → checkout_url (lien PaPi) → le client l'affiche
 * en modal. Au règlement, PaPi POST le callback → markIntentPaid → escrow financé +
 * réservation confirmée + échéancier de reversement JOUR PAR JOUR (cf. lib/payments).
 * Doctrine [[project_talk2me_payment_doctrine]]. Caution/litiges hors T2M.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { areDatesFree } from '@/lib/rental-planning';
import { startOrder } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  const dates = Array.isArray(b.dates) ? (b.dates as unknown[]).filter((d): d is string => typeof d === 'string') : [];
  const msisdn = typeof b.msisdn === 'string' ? b.msisdn : null;
  const pickupTime = typeof b.pickup_time === 'string' && /^\d{1,2}:\d{2}$/.test(b.pickup_time) ? b.pickup_time : null;
  if (!id || !dates.length) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const chk = areDatesFree(id, dates);
  if (!chk.ok || !chk.ownerId || chk.priceCents == null) return NextResponse.json({ error: 'dates_unavailable' }, { status: 400 });
  if (chk.ownerId === me.id) return NextResponse.json({ error: 'own_listing' }, { status: 400 });

  const total = chk.priceCents * chk.dates.length;
  if (total <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  // STEP-UP DESKTOP : location payée depuis un ordinateur → validation mobile d'abord.
  const payAuthId = typeof b.pay_auth_id === 'string' ? b.pay_auth_id : null;
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: total, currency: MARKET_CURRENCY, label: 'Location véhicule', payAuthId });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id,
    amountCents: total,
    currency: MARKET_CURRENCY,
    msisdn,
    orderType: 'rental',
    itemId: `rental:${id}`,
    sellerId: chk.ownerId,
    forceExternal: true, // pas de wallet → PaPi
    rental: { annonce_id: id, dates: chk.dates, renter_id: me.id, owner_total_cents: total, pickup_time: pickupTime },
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'payment_failed' }, { status: 400 });

  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id, days: chk.dates.length });
}
