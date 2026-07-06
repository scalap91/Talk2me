/**
 * POST /api/commerce/buy (Pascal 2026-06-23) — ACHAT PROTÉGÉ unifié.
 *
 * Prix + vendeur résolus CÔTÉ SERVEUR (lib/commerce-resolve). startOrder calcule le
 * TOTAL payé par l'acheteur (article + commission T2M + frais PaPi + livraison) et
 * lance l'achat protégé (escrow) : solde wallet → bloqué direct ; sinon paiement
 * (PaPi/MVola) → escrow financé au callback.
 * Body : { type:'boutique'|'plat'|'annonce', shop_id?, shop_key?, item_id?, items?, annonce_id?, msisdn? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startOrder } from '@/lib/payments';
import { resolveOrderTarget } from '@/lib/commerce-resolve';
import { resolveDelivery } from '@/lib/commerce-pricing';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { type?: string; channel?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string; msisdn?: string; lat?: number; lng?: number; force_external?: boolean; pay_auth_id?: string } = {};
  try { body = await req.json(); } catch { /* */ }

  // Card OS : garde-fou — un appelant peut passer le `channel` (switch de la card) ;
  // on le mappe vers le `type` attendu. `type` explicite reste prioritaire.
  if (!body.type && body.channel) {
    body.type = body.channel === 'eat' ? 'plat' : body.channel === 'annonce' ? 'annonce' : 'boutique';
  }

  const t = resolveOrderTarget(body);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status || 400 });
  if (!t.priceCents || t.priceCents <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  // STEP-UP DESKTOP : un paiement lancé depuis un ordinateur (session web) exige une
  // validation sur le mobile AVANT d'atteindre la page de paiement. Mobile natif = direct.
  const payLabel = body.type === 'rental' ? 'Location' : body.type === 'boutique' ? 'Achat boutique' : body.type === 'plat' ? 'Commande' : 'Achat';
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: t.priceCents, currency: MARKET_CURRENCY, label: payLabel, payAuthId: body.pay_auth_id });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id,
    amountCents: t.priceCents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: body.type || '',
    itemId: t.itemId || '',
    sellerId: t.sellerId || '',
    deliveryCents: resolveDelivery(t, body.lat, body.lng),
    forceExternal: !!body.force_external, // doctrine : paiement PaPi (pas le wallet)
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'order_failed' }, { status: 400 });
  return NextResponse.json({
    ok: true,
    mode: r.mode,                 // 'paid' (escrow bloqué via solde) | 'pay' (paiement en cours)
    escrow_id: r.escrow_id,
    intent_id: r.intent?.id,
    checkout_url: r.checkout_url,  // null si push USSD
    currency: MARKET_CURRENCY,
    quote: r.quote,               // détail : article + commission + frais PaPi + total
  });
}
