/**
 * POST /api/annonces/reserve { id } — ACOMPTE DE RÉSERVATION via PaPi.
 * L'acheteur verse l'acompte demandé par le vendeur → escrow vers le vendeur + le bien
 * passe RÉSERVÉ (14 j). Doctrine [[project_talk2me_payment_doctrine]] : opérateur, pas de wallet.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getAnnonceForReserve } from '@/lib/annonces-deposit';
import { startOrder, tooManyPendingIntents } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOLD_MS = 14 * 24 * 60 * 60 * 1000; // bien bloqué 14 jours après l'acompte

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const a = getAnnonceForReserve(id);
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!a.deposit_cents || a.deposit_cents <= 0) return NextResponse.json({ error: 'no_deposit' }, { status: 400 });
  if (a.owner_id === me.id) return NextResponse.json({ error: 'own_listing' }, { status: 400 });
  if (a.reserved_until && a.reserved_until > Date.now()) return NextResponse.json({ error: 'already_reserved' }, { status: 409 });

  // ANTI-SPAM (Audit #57) : on refuse d'initier un énième acompte si trop d'intents en attente.
  if (tooManyPendingIntents(me.id)) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });

  // STEP-UP DESKTOP : paiement depuis un ordinateur → validation mobile d'abord.
  const payAuthId = typeof b.pay_auth_id === 'string' ? b.pay_auth_id : null;
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: a.deposit_cents, currency: MARKET_CURRENCY, label: `Acompte · ${a.title}`, payAuthId });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id, amountCents: a.deposit_cents, currency: MARKET_CURRENCY,
    msisdn: typeof b.msisdn === 'string' ? b.msisdn : null,
    orderType: 'deposit', itemId: `reserve:${id}`, sellerId: a.owner_id,
    forceExternal: true,
    reserve: { annonce_id: id, buyer_id: me.id, until_ms: Date.now() + HOLD_MS },
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'payment_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id });
}
