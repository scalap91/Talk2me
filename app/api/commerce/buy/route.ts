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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { type?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string; msisdn?: string; lat?: number; lng?: number } = {};
  try { body = await req.json(); } catch { /* */ }

  const t = resolveOrderTarget(body);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status || 400 });
  if (!t.priceCents || t.priceCents <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  const r = await startOrder({
    userId: me.id,
    amountCents: t.priceCents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: body.type || '',
    itemId: t.itemId || '',
    sellerId: t.sellerId || '',
    deliveryCents: resolveDelivery(t, body.lat, body.lng),
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
