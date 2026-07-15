/**
 * POST /api/commerce/tip — POURBOIRE user→user (Pascal 2026-07-14).
 * Body : { toUserId, amountCents, msisdn? }. Réutilise le rail vérifié startOrder :
 * escrow + COMMISSION PLATEFORME + frais PaPi + quote (orderType 'tip', pas d'article).
 * Le montant part en escrow, la commission plateforme est prélevée, le reste au destinataire.
 * Aucun rail parallèle : même moteur que l'achat boutique.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startOrder } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { toUserId?: string; amountCents?: number; msisdn?: string; pay_auth_id?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const toUserId = (body.toUserId || '').trim();
  const amountCents = Math.round(Number(body.amountCents) || 0);
  if (!toUserId) return NextResponse.json({ error: 'no_recipient' }, { status: 400 });
  if (toUserId === me.id) return NextResponse.json({ error: 'cannot_tip_self' }, { status: 400 });
  if (amountCents <= 0) return NextResponse.json({ error: 'bad_amount' }, { status: 400 });

  // STEP-UP DESKTOP : un paiement lancé depuis un ordinateur exige une validation mobile d'abord.
  const gate = requireDesktopPayAuth(req, me.id, { amountCents, currency: MARKET_CURRENCY, label: 'Pourboire', payAuthId: body.pay_auth_id });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id,
    amountCents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: 'tip',
    itemId: '',
    sellerId: toUserId,
    forceExternal: true, // doctrine : paiement PaPi, pas le wallet
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'tip_failed' }, { status: 400 });
  return NextResponse.json({
    ok: true,
    mode: r.mode,
    escrow_id: r.escrow_id,
    intent_id: r.intent?.id,
    checkout_url: r.checkout_url,
    currency: MARKET_CURRENCY,
    quote: r.quote,
  });
}
