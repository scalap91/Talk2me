/**
 * POST /api/leases/pay { due_id } — paie une ÉCHÉANCE de loyer via PaPi (escrow → bailleur).
 * Loyer récurrent SEMI-AUTO : le locataire règle chaque mois en 1 clic. Au callback,
 * markDuePaid marque l'échéance payée. Doctrine [[project_talk2me_payment_doctrine]].
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDueForPay } from '@/lib/leases';
import { startOrder } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const dueId = typeof b.due_id === 'string' ? b.due_id : '';
  if (!dueId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const ctx = getDueForPay(dueId);
  if (!ctx) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (ctx.lease.tenant_id !== me.id) return NextResponse.json({ error: 'not_tenant' }, { status: 403 });
  if (ctx.due.status === 'paid') return NextResponse.json({ error: 'already_paid' }, { status: 409 });

  const payAuthId = typeof b.pay_auth_id === 'string' ? b.pay_auth_id : null;
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: ctx.due.amount_cents, currency: MARKET_CURRENCY, label: `Loyer ${ctx.due.period}`, payAuthId });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id, amountCents: ctx.due.amount_cents, currency: MARKET_CURRENCY,
    msisdn: typeof b.msisdn === 'string' ? b.msisdn : null,
    orderType: 'rent', itemId: `rent:${dueId}`, sellerId: ctx.lease.landlord_id,
    forceExternal: true, rent: { due_id: dueId },
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'payment_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id });
}
